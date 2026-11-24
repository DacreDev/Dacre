import {
  type CodeSymbol,
  type CodeSymbolIndexStatus,
  type CodeSymbolProjectInput,
  CodeSymbolProjectNotFoundError,
  type CodeSymbolSearchInput,
  type CodeSymbolSearchResult,
  CodeSymbolStorageError,
  type ProjectId,
} from "@dacre/contracts";
import * as NodeSqliteClient from "@dacre/shared/nodeSqliteClient";
import * as Arr from "effect/Array";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FiberMap from "effect/FiberMap";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";
import * as SqlClient from "effect/sql/SqlClient";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import { type IgnoreFile, parseIgnoreFile } from "../workspace/IgnorePatterns.ts";
import * as SymbolParser from "./symbolParser.ts";
import { type SymbolLanguage, symbolLanguageForPath } from "./symbolQueries.ts";

const MAX_FILES = 100_000;
const MAX_WALK_ENTRIES = 200_000;
const MAX_FILE_BYTES = 1024 * 1024;
/** A search refreshes the index at most this often, so typing does not rescan the project. */
const REFRESH_INTERVAL_MS = 5_000;
const STAT_CONCURRENCY = 16;
/** Reads overlap the worker's parsing, which takes one file at a time. */
const PARSE_CONCURRENCY = 4;
const WRITE_BATCH_FILES = 100;
const INSERT_BATCH_ROWS = 1_000;
const SEARCH_DEFAULT_LIMIT = 50;

// Only source extensions are read, which already leaves out lockfiles, keys, certificates and
// binaries by name. These carry secrets or vendored code under a source extension too.
const VENDOR_FOLDERS = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  "vendor",
  "third_party",
  "Pods",
  ".venv",
  "venv",
  "site-packages",
  ".yarn",
]);
const SECRET_NAME = /^(?:\.env|id_(?:rsa|dsa|ecdsa|ed25519))/iu;
const MINIFIED_NAME = /[.-]min\.[cm]?js$/iu;

interface SourceFile {
  readonly path: string;
  readonly language: SymbolLanguage;
  readonly size: number;
  readonly mtimeMs: number;
}

interface ProjectIndex {
  readonly status: SubscriptionRef.SubscriptionRef<CodeSymbolIndexStatus>;
  checkedAt: number | undefined;
}

export class CodeSymbols extends Context.Service<
  CodeSymbols,
  {
    /**
     * Definitions whose name contains the query, best first. The first search indexes the
     * project in the background and later ones refresh what changed; none waits for that.
     */
    readonly search: (
      input: CodeSymbolSearchInput,
    ) => Effect.Effect<
      CodeSymbolSearchResult,
      CodeSymbolProjectNotFoundError | CodeSymbolStorageError
    >;
    /** The index's status now, then again as it changes. */
    readonly status: (
      input: CodeSymbolProjectInput,
    ) => Stream.Stream<
      CodeSymbolIndexStatus,
      CodeSymbolProjectNotFoundError | CodeSymbolStorageError
    >;
    /** Drops the project's index and builds it again in the background. */
    readonly rebuild: (
      input: CodeSymbolProjectInput,
    ) => Effect.Effect<
      CodeSymbolIndexStatus,
      CodeSymbolProjectNotFoundError | CodeSymbolStorageError
    >;
  }
>()("dacre/codeSymbols/CodeSymbols") {}

const storageError = (cause: unknown) => new CodeSymbolStorageError({ cause });

/** Whether the pattern file leaves out `path` or a folder above it, as Git would. */
const isIgnored = (ignore: IgnoreFile | undefined, path: string) => {
  if (ignore === undefined) return false;
  const segments = path.split("/");
  for (let depth = 1; depth <= segments.length; depth += 1) {
    const prefix = segments.slice(0, depth).join("/");
    if (ignore.decide(prefix, depth < segments.length) === "ignored") return true;
  }
  return false;
};

const sourceLanguage = (path: string, ignore: IgnoreFile | undefined) => {
  const segments = path.split("/");
  const name = segments.at(-1) ?? "";
  if (segments.some((segment) => VENDOR_FOLDERS.has(segment))) return undefined;
  if (SECRET_NAME.test(name) || MINIFIED_NAME.test(name) || isIgnored(ignore, path)) {
    return undefined;
  }
  return symbolLanguageForPath(path);
};

/** A NUL byte, or lines that average over 500 characters, as in a minified bundle. */
const isBinaryOrMinified = (text: string) => {
  if (text.includes("\u0000")) return true;
  return text.length > 1024 && text.length / text.split("\n").length > 500;
};

export const layer = Layer.effect(
  CodeSymbols,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const vcs = yield* VcsProcess.VcsProcess;
    const projects = yield* ProjectStore.ProjectStoreV2;
    const passes = yield* FiberMap.make<string>();
    // One pass at a time across projects, so indexing never takes more than one core.
    const passLock = yield* Semaphore.make(1);
    const indexLock = yield* Semaphore.make(1);
    const indexes = new Map<string, ProjectIndex>();

    const rootOf = Effect.fn("CodeSymbols.rootOf")(function* (projectId: ProjectId) {
      const project = yield* projects.get(projectId).pipe(Effect.mapError(storageError));
      if (Option.isNone(project)) return yield* new CodeSymbolProjectNotFoundError({ projectId });
      return project.value.workspaceRoot;
    });

    const indexOf = (root: string) =>
      indexLock.withPermits(1)(
        Effect.gen(function* () {
          const existing = indexes.get(root);
          if (existing !== undefined) return existing;
          const counts = yield* sql<{ readonly files: number }>`
            SELECT COUNT(*) AS files FROM code_symbol_files WHERE root = ${root}
          `.pipe(NodeSqliteClient.readOnly, Effect.mapError(storageError));
          const files = counts[0]?.files ?? 0;
          const created: ProjectIndex = {
            status: yield* SubscriptionRef.make<CodeSymbolIndexStatus>({
              state: files > 0 ? "ready" : "idle",
              filesDone: 0,
              filesTotal: 0,
              indexedFiles: files,
              lastError: null,
            }),
            checkedAt: undefined,
          };
          indexes.set(root, created);
          return created;
        }),
      );

    const updateStatus = (index: ProjectIndex, patch: Partial<CodeSymbolIndexStatus>) =>
      SubscriptionRef.update(index.status, (status) => ({ ...status, ...patch }));

    /** Every candidate path, from Git where it can list them, else by walking the folder. */
    const listPaths = Effect.fn("CodeSymbols.listPaths")(function* (
      root: string,
      ignore: IgnoreFile | undefined,
    ) {
      const listed = yield* vcs
        .run({
          operation: "CodeSymbols.listPaths",
          command: "git",
          args: [
            "-c",
            "core.fsmonitor=false",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
          ],
          cwd: root,
          allowNonZeroExit: true,
          timeoutMs: 30_000,
          maxOutputBytes: 64 * 1024 * 1024,
        })
        .pipe(Effect.option);
      if (Option.isSome(listed) && listed.value.exitCode === 0 && !listed.value.stdoutTruncated) {
        return [...new Set(listed.value.stdout.split("\0"))].filter((entry) => entry !== "");
      }
      // shortcut: the walk follows symlinked folders, so a cycle only ends at MAX_WALK_ENTRIES.
      const found: Array<string> = [];
      const folders = [""];
      let seen = 0;
      while (folders.length > 0 && seen < MAX_WALK_ENTRIES && found.length < MAX_FILES) {
        const folder = folders.shift()!;
        const names = yield* fileSystem
          .readDirectory(path.join(root, folder))
          .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
        for (const name of names) {
          seen += 1;
          const relative = folder === "" ? name : `${folder}/${name}`;
          if (name.startsWith(".") || VENDOR_FOLDERS.has(name)) continue;
          if (symbolLanguageForPath(name) !== undefined) {
            found.push(relative);
            continue;
          }
          const info = yield* fileSystem.stat(path.join(root, relative)).pipe(Effect.option);
          if (
            Option.isSome(info) &&
            info.value.type === "Directory" &&
            !isIgnored(ignore, relative)
          ) {
            folders.push(relative);
          }
        }
      }
      return found;
    });

    const listSourceFiles = Effect.fn("CodeSymbols.listSourceFiles")(function* (root: string) {
      const ignore = Option.getOrUndefined(
        Option.map(
          yield* fileSystem.readFileString(path.join(root, ".dacreignore")).pipe(Effect.option),
          parseIgnoreFile,
        ),
      );
      const candidates = (yield* listPaths(root, ignore)).flatMap((relative) => {
        const language = sourceLanguage(relative, ignore);
        return language === undefined ? [] : [{ path: relative, language }];
      });
      if (candidates.length > MAX_FILES) {
        yield* Effect.logWarning("Indexing the first symbol files only.", {
          files: candidates.length,
          limit: MAX_FILES,
        });
      }
      const files = yield* Effect.forEach(
        candidates.slice(0, MAX_FILES),
        (candidate) =>
          fileSystem.stat(path.join(root, candidate.path)).pipe(
            Effect.map((info): ReadonlyArray<SourceFile> =>
              info.type === "File" && Number(info.size) <= MAX_FILE_BYTES
                ? [
                    {
                      ...candidate,
                      size: Number(info.size),
                      mtimeMs: Option.getOrUndefined(info.mtime)?.getTime() ?? 0,
                    },
                  ]
                : [],
            ),
            Effect.orElseSucceed((): ReadonlyArray<SourceFile> => []),
          ),
        { concurrency: STAT_CONCURRENCY },
      );
      return files.flat();
    });

    const removeFiles = (ids: ReadonlyArray<number>) =>
      Effect.forEach(
        Arr.chunksOf(ids, 500),
        (chunk) =>
          sql.withTransaction(
            Effect.all([
              sql`DELETE FROM code_symbols WHERE file_id IN ${sql.in(chunk)}`,
              sql`DELETE FROM code_symbol_files WHERE id IN ${sql.in(chunk)}`,
            ]),
          ),
        { discard: true },
      );

    const writeFiles = (
      root: string,
      parsed: Arr.NonEmptyReadonlyArray<{
        readonly file: SourceFile;
        readonly symbols: ReadonlyArray<SymbolParser.ParsedSymbol>;
      }>,
    ) =>
      sql.withTransaction(
        Effect.gen(function* () {
          const rows = yield* sql<{ readonly id: number; readonly path: string }>`
            INSERT INTO code_symbol_files ${sql.insert(
              Arr.map(parsed, ({ file }) => ({
                root,
                path: file.path,
                size: file.size,
                mtime_ms: file.mtimeMs,
              })),
            )}
            ON CONFLICT (root, path) DO UPDATE SET size = excluded.size, mtime_ms = excluded.mtime_ms
            RETURNING id, path
          `;
          const ids = new Map(rows.map((row) => [row.path, row.id]));
          yield* sql`DELETE FROM code_symbols WHERE file_id IN ${sql.in([...ids.values()])}`;
          const symbols = parsed.flatMap(({ file, symbols }) =>
            symbols.map((symbol) => ({
              file_id: ids.get(file.path)!,
              name: symbol.name,
              kind: symbol.kind,
              line: symbol.line,
              col: symbol.column,
              container: symbol.container,
            })),
          );
          for (const chunk of Arr.chunksOf(symbols, INSERT_BATCH_ROWS)) {
            yield* sql`INSERT INTO code_symbols ${sql.insert(chunk)}`;
          }
        }),
      );

    /** Parses what changed since the last pass and drops what is gone; the indexed file count. */
    const indexProject = Effect.fn("CodeSymbols.index")(function* (
      root: string,
      project: ProjectIndex,
    ) {
      const files = yield* listSourceFiles(root);
      const known = yield* sql<{
        readonly id: number;
        readonly path: string;
        readonly size: number;
        readonly mtimeMs: number;
      }>`
        SELECT id, path, size, mtime_ms AS "mtimeMs" FROM code_symbol_files WHERE root = ${root}
      `;
      const knownByPath = new Map(known.map((row) => [row.path, row]));
      const listed = new Set(files.map((file) => file.path));
      yield* removeFiles(known.filter((row) => !listed.has(row.path)).map((row) => row.id));
      const changed = files.filter((file) => {
        const row = knownByPath.get(file.path);
        return row === undefined || row.size !== file.size || row.mtimeMs !== file.mtimeMs;
      });
      yield* updateStatus(project, { filesDone: 0, filesTotal: changed.length });
      if (changed.length > 0) {
        yield* Effect.scoped(
          Effect.gen(function* () {
            const parser = yield* SymbolParser.make([
              ...new Set(changed.map((file) => file.language)),
            ]);
            for (const batch of Arr.chunksOf(changed, WRITE_BATCH_FILES)) {
              const parsed = yield* Effect.forEach(
                batch,
                (file) =>
                  fileSystem.readFileString(path.join(root, file.path)).pipe(
                    Effect.option,
                    Effect.flatMap((text) =>
                      Option.isNone(text) || isBinaryOrMinified(text.value)
                        ? Effect.succeed([])
                        : parser.parse(file.language, text.value),
                    ),
                    Effect.map((symbols) => ({ file, symbols })),
                  ),
                { concurrency: PARSE_CONCURRENCY },
              );
              yield* writeFiles(root, parsed);
              yield* SubscriptionRef.update(project.status, (status) => ({
                ...status,
                filesDone: status.filesDone + batch.length,
              }));
            }
          }),
        );
      }
      return files.length;
    });

    const startPass = Effect.fn("CodeSymbols.startPass")(function* (
      root: string,
      project: ProjectIndex,
      options: { readonly rebuild: boolean },
    ) {
      project.checkedAt = yield* Clock.currentTimeMillis;
      yield* updateStatus(project, {
        state: "indexing",
        filesDone: 0,
        filesTotal: 0,
        // A rebuild starts from nothing, as a first index does.
        ...(options.rebuild ? { indexedFiles: 0 } : {}),
      });
      const clear = sql<{ readonly id: number }>`
        SELECT id FROM code_symbol_files WHERE root = ${root}
      `.pipe(Effect.flatMap((rows) => removeFiles(rows.map((row) => row.id))));
      const pass = (
        options.rebuild
          ? Effect.andThen(clear, indexProject(root, project))
          : indexProject(root, project)
      ).pipe(
        Effect.mapError((error) => (error._tag === "SqlError" ? storageError(error) : error)),
        passLock.withPermits(1),
        // The next refresh waits from the end of a long pass, not its start.
        Effect.ensuring(
          Effect.flatMap(Clock.currentTimeMillis, (now) =>
            Effect.sync(() => {
              project.checkedAt = now;
            }),
          ),
        ),
        Effect.matchCauseEffect({
          onSuccess: (indexedFiles) =>
            updateStatus(project, { state: "ready", indexedFiles, lastError: null }),
          // A rebuild interrupts the pass it replaces, and the new pass owns the status.
          onFailure: (cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : Effect.logWarning("Symbol indexing failed.", { cause }).pipe(
                  Effect.andThen(
                    updateStatus(project, {
                      state: "ready",
                      lastError: Option.match(Cause.findErrorOption(cause), {
                        onNone: () => "Indexing stopped unexpectedly.",
                        onSome: (error) => error.message,
                      }),
                    }),
                  ),
                ),
        }),
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
      );
      yield* FiberMap.run(passes, root, pass, { onlyIfMissing: !options.rebuild });
    });

    const projectIndex = Effect.fn("CodeSymbols.projectIndex")(function* (projectId: ProjectId) {
      const root = yield* rootOf(projectId);
      return { root, project: yield* indexOf(root) };
    });

    const search: CodeSymbols["Service"]["search"] = Effect.fn("CodeSymbols.search")(
      function* (input) {
        const { root, project } = yield* projectIndex(input.projectId);
        const now = yield* Clock.currentTimeMillis;
        const due =
          project.checkedAt === undefined || now - project.checkedAt >= REFRESH_INTERVAL_MS;
        if (due && !(yield* FiberMap.has(passes, root))) {
          yield* startPass(root, project, { rebuild: false });
        }
        const escaped = input.query.replace(/[\\%_]/gu, "\\$&");
        const symbols = yield* Effect.gen(function* () {
          const trigrams =
            input.query.length >= 3 &&
            (yield* sql`SELECT 1 FROM sqlite_master WHERE name = 'code_symbols_fts'`).length > 0;
          // Trigrams match three or more characters; shorter queries scan the project's names.
          const source = trigrams
            ? sql`code_symbols_fts JOIN code_symbols AS s ON s.id = code_symbols_fts.rowid`
            : sql`code_symbols AS s`;
          const match = trigrams
            ? sql`code_symbols_fts MATCH ${`"${input.query.replaceAll('"', '""')}"`}`
            : sql`s.name LIKE ${`%${escaped}%`} ESCAPE '\\'`;
          return yield* sql<CodeSymbol>`
            SELECT s.name, s.kind, f.path, s.line, s.col AS "column", s.container
            FROM ${source} JOIN code_symbol_files AS f ON f.id = s.file_id
            WHERE ${sql.and([
              sql`f.root = ${root}`,
              match,
              ...(input.kind === undefined ? [] : [sql`s.kind = ${input.kind}`]),
            ])}
            ORDER BY lower(s.name) = lower(${input.query}) DESC,
              s.name LIKE ${`${escaped}%`} ESCAPE '\\' DESC, length(s.name), f.path, s.line
            LIMIT ${input.limit ?? SEARCH_DEFAULT_LIMIT}
          `;
        }).pipe(NodeSqliteClient.readOnly, Effect.mapError(storageError));
        return { symbols, status: yield* SubscriptionRef.get(project.status) };
      },
    );

    const status: CodeSymbols["Service"]["status"] = (input) =>
      Stream.unwrap(
        Effect.map(projectIndex(input.projectId), ({ project }) =>
          SubscriptionRef.changes(project.status),
        ),
      );

    const rebuild: CodeSymbols["Service"]["rebuild"] = Effect.fn("CodeSymbols.rebuild")(
      function* (input) {
        const { root, project } = yield* projectIndex(input.projectId);
        yield* startPass(root, project, { rebuild: true });
        return yield* SubscriptionRef.get(project.status);
      },
    );

    return CodeSymbols.of({ search, status, rebuild });
  }),
);
