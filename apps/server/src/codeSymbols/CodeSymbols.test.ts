import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { type CodeSymbolKind, ProjectId } from "@dacre/contracts";
import * as NodeSqliteClient from "@dacre/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import migration from "../persistence/Migrations/112_CodeSymbols.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as CodeSymbols from "./CodeSymbols.ts";

const projectId = ProjectId.make("project:symbols");

const layerFor = (root: string, options?: { readonly fts?: boolean }) =>
  CodeSymbols.layer.pipe(
    Layer.provideMerge(
      Layer.effectDiscard(
        Effect.gen(function* () {
          yield* migration;
          if (options?.fts !== false) return;
          // As on an SQLite build without FTS5 trigrams, where the migration skips the index.
          const sql = yield* SqlClient.SqlClient;
          yield* sql`DROP TRIGGER code_symbols_fts_insert`;
          yield* sql`DROP TRIGGER code_symbols_fts_delete`;
          yield* sql`DROP TABLE code_symbols_fts`;
        }),
      ).pipe(Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" }))),
    ),
    Layer.provideMerge(
      Layer.mock(ProjectStore.ProjectStoreV2)({
        get: (id) =>
          Effect.succeed(
            id === projectId
              ? Option.some({ workspaceRoot: root } as ProjectStore.ProjectRow)
              : Option.none(),
          ),
      }),
    ),
  );

const run = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  Effect.flatMap(VcsProcess.VcsProcess, (vcs) =>
    vcs.run({ operation: "CodeSymbols.test", command, args, cwd, timeoutMs: 30_000 }),
  );

const writeFiles = (root: string, files: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    for (const [relative, contents] of Object.entries(files)) {
      yield* fileSystem.makeDirectory(path.dirname(path.join(root, relative)), {
        recursive: true,
      });
      yield* fileSystem.writeFileString(path.join(root, relative), contents);
    }
  });

/** A temporary project with `files`, committed to Git unless `git` is false. */
const project = (files: Readonly<Record<string, string>>, options?: { readonly git?: boolean }) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "dacre-code-symbols-" });
    yield* writeFiles(root, files);
    if (options?.git !== false) {
      yield* run("git", ["init", "--quiet"], root);
      // `-f` tracks vendored folders a .gitignore would hide, which the index skips anyway.
      yield* run("git", ["add", "-f", "--all"], root);
    }
    return root;
  });

const search = (query: string, kind?: CodeSymbolKind) =>
  Effect.flatMap(CodeSymbols.CodeSymbols, (symbols) =>
    symbols.search({ projectId, query, ...(kind === undefined ? {} : { kind }) }),
  );

const names = (query: string, kind?: CodeSymbolKind) =>
  Effect.map(search(query, kind), ({ symbols }) => symbols.map((symbol) => symbol.name));

/** The status once the pass a search or rebuild started has finished. */
const settled = Effect.flatMap(CodeSymbols.CodeSymbols, (symbols) =>
  symbols.status({ projectId }).pipe(
    Stream.filter((status) => status.state !== "indexing"),
    Stream.runHead,
    Effect.map(Option.getOrThrow),
  ),
);

const layerTest = VcsProcess.layer.pipe(Layer.provideMerge(NodeServices.layer));

describe("CodeSymbols", () => {
  it.effect("indexes a project on its first search and ranks exact and prefix matches first", () =>
    Effect.gen(function* () {
      const root = yield* project({
        "src/index.ts": [
          "export class Index {}",
          "export class WorkspaceIndex {}",
          "export function indexFiles() {}",
          "export function reindex() {}",
          "export const INDEX_LIMIT = 10;",
        ].join("\n"),
        "src/other.py": "def unrelated():\n    pass\n",
      });
      yield* Effect.gen(function* () {
        const first = yield* search("index");
        assert.strictEqual(first.status.state, "indexing");
        assert.deepStrictEqual(yield* settled, {
          state: "ready",
          filesDone: 2,
          filesTotal: 2,
          indexedFiles: 2,
          lastError: null,
        });
        assert.deepStrictEqual(yield* names("index"), [
          "Index",
          "indexFiles",
          "INDEX_LIMIT",
          "reindex",
          "WorkspaceIndex",
        ]);
        assert.deepStrictEqual(yield* names("index", "function"), ["indexFiles", "reindex"]);
        const { symbols } = yield* search("unrelated");
        assert.deepStrictEqual(symbols, [
          {
            name: "unrelated",
            kind: "function",
            path: "src/other.py",
            line: 1,
            column: 5,
            container: null,
          },
        ]);
      }).pipe(Effect.provide(layerFor(root)));
    }).pipe(Effect.scoped, Effect.provide(layerTest)),
  );

  it.effect("never indexes secrets, vendored, minified, binary, large or ignored files", () =>
    Effect.gen(function* () {
      const root = yield* project({
        "src/keep.ts": "export function keepMe() {}\n",
        ".env.js": "export const secretFromEnv = 'x';\n",
        "id_rsa.py": "secret_from_key = 1\n",
        "server.pem": "-----BEGIN PRIVATE KEY-----\n",
        "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
        "node_modules/lib/index.js": "export function vendoredLib() {}\n",
        "vendor/dep/dep.go": "package dep\n\nfunc VendoredDep() {}\n",
        "dist/app.min.js": "function minifiedByName(){}\n",
        "dist/bundle.js": `function minifiedByShape(){}${";".repeat(4_000)}\n`,
        "src/video.ts": "export const binaryFile = 1;\u0000\n",
        "src/huge.ts": `export const hugeFile = 1;\n${"//\n".repeat(400_000)}`,
        "generated/out.ts": "export function ignoredByDacre() {}\n",
        ".dacreignore": "generated/\n",
      });
      yield* Effect.gen(function* () {
        yield* search("keepMe");
        // Minified and binary files keep an empty row, so later passes skip them unread.
        assert.strictEqual((yield* settled).indexedFiles, 3);
        for (const name of [
          "secretFromEnv",
          "secret_from_key",
          "vendoredLib",
          "VendoredDep",
          "minifiedByName",
          "minifiedByShape",
          "binaryFile",
          "hugeFile",
          "ignoredByDacre",
        ]) {
          assert.deepStrictEqual(yield* names(name), [], name);
        }
        assert.deepStrictEqual(yield* names("keepMe"), ["keepMe"]);
      }).pipe(Effect.provide(layerFor(root)));
    }).pipe(Effect.scoped, Effect.provide(layerTest)),
  );

  it.effect("re-parses only changed and added files and drops removed ones", () =>
    Effect.gen(function* () {
      const root = yield* project({
        "a.ts": "export function alphaOne() {}\n",
        "b.ts": "export function betaOne() {}\n",
        "c.ts": "export function gammaOne() {}\n",
      });
      yield* Effect.gen(function* () {
        yield* search("One");
        yield* settled;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* writeFiles(root, {
          "a.ts": "export function alphaSecond() {}\n",
          "d.ts": "export function deltaOne() {}\n",
        });
        yield* fileSystem.remove(path.join(root, "c.ts"));

        // A search soon after the last pass reads the index as it is.
        assert.deepStrictEqual(yield* names("One"), ["betaOne", "alphaOne", "gammaOne"]);
        yield* TestClock.adjust("1 minute");
        yield* search("One");
        assert.deepStrictEqual(yield* settled, {
          state: "ready",
          filesDone: 2,
          filesTotal: 2,
          indexedFiles: 3,
          lastError: null,
        });
        assert.deepStrictEqual(yield* names("One"), ["betaOne", "deltaOne"]);
        assert.deepStrictEqual(yield* names("alpha"), ["alphaSecond"]);
      }).pipe(Effect.provide(layerFor(root)));
    }).pipe(Effect.scoped, Effect.provide(layerTest)),
  );

  it.effect("searches by scanning names when SQLite has no FTS5 trigrams", () =>
    Effect.gen(function* () {
      const root = yield* project({
        "lib.rs": "pub fn parse_config() {}\npub struct ConfigError;\n",
      });
      yield* Effect.gen(function* () {
        yield* search("config");
        yield* settled;
        assert.deepStrictEqual(yield* names("config"), ["ConfigError", "parse_config"]);
        assert.deepStrictEqual(yield* names("Er"), ["ConfigError"]);
      }).pipe(Effect.provide(layerFor(root, { fts: false })));
    }).pipe(Effect.scoped, Effect.provide(layerTest)),
  );

  it.effect("walks a folder outside Git, skipping vendored folders", () =>
    Effect.gen(function* () {
      const root = yield* project(
        {
          "app/main.go": "package main\n\nfunc main() {}\n",
          "node_modules/pkg/index.js": "export function vendoredLib() {}\n",
        },
        { git: false },
      );
      yield* Effect.gen(function* () {
        yield* search("main");
        assert.strictEqual((yield* settled).indexedFiles, 1);
        assert.deepStrictEqual(yield* names("main"), ["main"]);
        assert.deepStrictEqual(yield* names("vendoredLib"), []);
      }).pipe(Effect.provide(layerFor(root)));
    }).pipe(Effect.scoped, Effect.provide(layerTest)),
  );

  it.effect("rebuilds from scratch and reports a project with no supported files", () =>
    Effect.gen(function* () {
      const root = yield* project({ "README.md": "# Notes\n" });
      yield* Effect.gen(function* () {
        const symbols = yield* CodeSymbols.CodeSymbols;
        assert.strictEqual((yield* symbols.rebuild({ projectId })).state, "indexing");
        assert.deepStrictEqual(yield* settled, {
          state: "ready",
          filesDone: 0,
          filesTotal: 0,
          indexedFiles: 0,
          lastError: null,
        });
        const missing = yield* symbols
          .search({ projectId: ProjectId.make("project:gone"), query: "x" })
          .pipe(Effect.flip);
        assert.strictEqual(missing._tag, "CodeSymbolProjectNotFoundError");
      }).pipe(Effect.provide(layerFor(root)));
    }).pipe(Effect.scoped, Effect.provide(layerTest)),
  );
});
