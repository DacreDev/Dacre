// @effect-diagnostics nodeBuiltinImport:off - the parser runs on a worker thread
import * as NodeModule from "node:module";
import * as NodeWorkerThreads from "node:worker_threads";

import type { CodeSymbolKind } from "@dacre/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { SYMBOL_QUERIES, type SymbolLanguage } from "./symbolQueries.ts";

export interface ParsedSymbol {
  readonly name: string;
  readonly kind: CodeSymbolKind;
  readonly line: number;
  readonly column: number;
  readonly container: string | null;
}

export class CodeSymbolParserError extends Schema.TaggedError<CodeSymbolParserError>()(
  "CodeSymbolParserError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "The symbol parser stopped.";
  }
}

type WorkerReply =
  | { readonly id: number; readonly symbols: ReadonlyArray<ParsedSymbol> }
  | { readonly id: number; readonly error: string };

// Follows the Tree-sitter runtime's source in the worker, which defines `module.exports`.
// A symbol's container is the query's `@container` capture, else the nearest enclosing
// definition when that is a class, interface, enum, type or module.
const WORKER_SOURCE = `
;const { parentPort, workerData } = require("node:worker_threads");
const { Parser, Language, Query } = module.exports;
const CONTAINERS = new Set(["class", "interface", "enum", "type", "module"]);
const ready = Parser.init({ wasmBinary: workerData.runtime });
const loaded = new Map();
const load = (name) => {
  if (!loaded.has(name)) {
    loaded.set(name, ready.then(async () => {
      const language = await Language.load(workerData.grammars[name]);
      const parser = new Parser();
      parser.setLanguage(language);
      return { parser, query: new Query(language, workerData.queries[name]) };
    }));
  }
  return loaded.get(name);
};
const extract = (query, root) => {
  const found = new Map();
  for (const match of query.matches(root)) {
    let definition, name, container;
    for (const capture of match.captures) {
      if (capture.name === "name") name = capture.node;
      else if (capture.name === "container") container = capture.node.text;
      else if (capture.name.startsWith("definition.")) definition = capture;
    }
    if (!definition || !name) continue;
    const previous = found.get(definition.node.id);
    if (previous && previous.pattern <= match.patternIndex) continue;
    found.set(definition.node.id, {
      pattern: match.patternIndex,
      kind: definition.name.slice("definition.".length),
      name: name.text,
      line: name.startPosition.row + 1,
      column: name.startPosition.column + 1,
      node: definition.node,
      container,
    });
  }
  const symbols = [];
  for (const symbol of found.values()) {
    let container = symbol.container ?? null;
    let inType = container !== null;
    for (let node = symbol.node.parent; container === null && node; node = node.parent) {
      const owner = found.get(node.id);
      if (!owner) continue;
      if (CONTAINERS.has(owner.kind)) {
        container = owner.name;
        inType = owner.kind !== "module";
      }
      break;
    }
    const kind = symbol.kind === "macro" ? "function" : symbol.kind === "function" && inType ? "method" : symbol.kind;
    symbols.push({ name: symbol.name, kind, line: symbol.line, column: symbol.column, container });
  }
  return symbols;
};
parentPort.on("message", ({ id, language, text }) => {
  load(language)
    .then(({ parser, query }) => {
      const tree = parser.parse(text);
      if (!tree) return [];
      try {
        return extract(query, tree.rootNode);
      } finally {
        tree.delete();
      }
    })
    .then(
      (symbols) => parentPort.postMessage({ id, symbols }),
      (error) => parentPort.postMessage({ id, error: String((error && error.message) || error) }),
    );
});
`;

/**
 * A Tree-sitter parser for `languages` on its own thread, so a large file never stalls the
 * server, and its WebAssembly heap ends with the scope. This thread reads the runtime and
 * grammars, so the worker reads no files and works where they sit inside an asar archive.
 */
export const make = Effect.fn("SymbolParser.make")(function* (
  languages: ReadonlyArray<SymbolLanguage>,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const failed = (cause: unknown) => new CodeSymbolParserError({ cause });
  const runtimePath = yield* Effect.try({
    try: () => NodeModule.createRequire(import.meta.url).resolve("@vscode/tree-sitter-wasm"),
    catch: failed,
  });
  const wasm = (name: string) =>
    fileSystem.readFile(path.join(path.dirname(runtimePath), `${name}.wasm`));
  const [source, runtime, grammars] = yield* Effect.all([
    fileSystem.readFileString(runtimePath),
    wasm("tree-sitter"),
    Effect.forEach(languages, (language) =>
      Effect.map(wasm(`tree-sitter-${language}`), (bytes) => [language, bytes] as const),
    ),
  ]).pipe(Effect.mapError(failed));

  const pending = new Map<
    number,
    (result: Effect.Effect<ReadonlyArray<ParsedSymbol>, CodeSymbolParserError>) => void
  >();
  let stopped: CodeSymbolParserError | undefined;
  const stop = (cause: unknown) => {
    stopped ??= failed(cause);
    for (const resume of pending.values()) resume(Effect.fail(stopped));
    pending.clear();
  };
  const worker = yield* Effect.acquireRelease(
    Effect.sync(() => {
      const worker = new NodeWorkerThreads.Worker(source + WORKER_SOURCE, {
        eval: true,
        workerData: { runtime, grammars: Object.fromEntries(grammars), queries: SYMBOL_QUERIES },
      });
      worker.on("message", (reply: WorkerReply) => {
        // A grammar that fails to load fails every file in its language, so it stops the pass.
        if ("error" in reply) return stop(reply.error);
        const resume = pending.get(reply.id);
        pending.delete(reply.id);
        resume?.(Effect.succeed(reply.symbols));
      });
      worker.on("error", stop);
      worker.on("exit", (code) => stop(`The parser thread exited with code ${code}.`));
      worker.unref();
      return worker;
    }),
    (worker) => Effect.promise(() => worker.terminate()),
  );
  let nextId = 0;
  const parse = (language: SymbolLanguage, text: string) =>
    Effect.callback<ReadonlyArray<ParsedSymbol>, CodeSymbolParserError>((resume) => {
      if (stopped !== undefined) return resume(Effect.fail(stopped));
      const id = nextId++;
      pending.set(id, resume);
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node workers do not accept a target origin.
      worker.postMessage({ id, language, text });
      return Effect.sync(() => pending.delete(id));
    });
  return { parse };
});
