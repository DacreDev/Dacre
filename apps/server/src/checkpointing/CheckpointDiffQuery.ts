import {
  CHECKPOINT_DIFF_TRUNCATED_MARKER,
  type CheckpointRef,
  OrchestrationGetTurnDiffResult,
  type OrchestrationGetFullThreadDiffInput,
  type OrchestrationGetFullThreadDiffResult,
  type OrchestrationGetTurnDiffInput,
  type OrchestrationGetTurnDiffResult as OrchestrationGetTurnDiffResultType,
  type OrchestrationRevertTurnDiffFilesInput,
  type ThreadId,
  type ThreadTurnRepositoryDiff,
} from "@dacre/contracts";
import * as Context from "effect/Context";
import * as Digest from "effect/crypto/Digest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

import {
  CHECKPOINT_DIFF_MAX_OUTPUT_BYTES,
  type VcsRestoreCheckpointPathsResult,
} from "../vcs/VcsDriver.ts";
import {
  checkpointRefForScopeOrdinal,
  nestedScopePaths,
} from "../orchestration-v2/CheckpointService.ts";
import type { ProjectionCheckpointContext } from "../orchestration-v2/ProjectionStore.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import { isGitMetadataName } from "../workspace/WorkspaceFileSystem.ts";
import { withCheckpointRestoreReservation } from "../workspace/workspaceLease.ts";
import {
  type CheckpointDiffOperation,
  CheckpointDiffResultInvalidError,
  CheckpointFileRevertRefusedError,
  CheckpointRefUnavailableError,
  CheckpointThreadNotFoundError,
  CheckpointTurnRangeUnavailableError,
  CheckpointWorkspacePathMissingError,
  type CheckpointServiceError,
} from "./Errors.ts";
import * as CheckpointStore from "./CheckpointStore.ts";
import { isGitImport, parseTurnDiffFilesFromNumstat, type TurnDiffFileSummary } from "./Diffs.ts";

// Windows limits a command line to 32,767 characters. Leave room for the rest of git's arguments.
const MAX_PATHSPEC_CHARS = 24_000;
const REPOSITORY_DIFF_CONCURRENCY = 6;

function batchFilePaths(files: ReadonlyArray<TurnDiffFileSummary>) {
  const batches: string[][] = [];
  let batch: string[] = [];
  let length = 0;
  for (const file of files) {
    const paths = file.previousPath === undefined ? [file.path] : [file.previousPath, file.path];
    const size = paths.reduce((total, path) => total + path.length + 16, 0);
    if (batch.length > 0 && length + size > MAX_PATHSPEC_CHARS) {
      batches.push(batch);
      batch = [];
      length = 0;
    }
    batch.push(...paths);
    length += size;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

export class CheckpointDiffQuery extends Context.Service<
  CheckpointDiffQuery,
  {
    readonly getTurnDiff: (
      input: OrchestrationGetTurnDiffInput,
    ) => Effect.Effect<OrchestrationGetTurnDiffResultType, CheckpointServiceError>;

    readonly getFullThreadDiff: (
      input: OrchestrationGetFullThreadDiffInput,
    ) => Effect.Effect<OrchestrationGetFullThreadDiffResult, CheckpointServiceError>;

    /** Puts files the range's diff lists back as the range found them; nothing else changes. */
    readonly revertFiles: (
      input: OrchestrationRevertTurnDiffFilesInput,
    ) => Effect.Effect<
      VcsRestoreCheckpointPathsResult,
      CheckpointServiceError | CheckpointFileRevertRefusedError | PlatformError.PlatformError
    >;
  }
>()("dacre/checkpointing/CheckpointDiffQuery") {}

const isTurnDiffResult = Schema.is(OrchestrationGetTurnDiffResult);

function buildTurnDiffResult(
  input: {
    readonly threadId: ThreadId;
    readonly fromTurnCount: number;
    readonly toTurnCount: number;
  },
  diff: string,
  repositories?: ReadonlyArray<ThreadTurnRepositoryDiff>,
): OrchestrationGetTurnDiffResultType {
  return {
    threadId: input.threadId,
    fromTurnCount: input.fromTurnCount,
    toTurnCount: input.toTurnCount,
    diff,
    ...(repositories === undefined ? {} : { repositories }),
  };
}

type ContextCheckpoint = ProjectionCheckpointContext["checkpoints"][number];

/**
 * A repository's checkpoints for a turn range. Only turns that changed it are recorded, each with
 * the baseline before it, so the range runs from its first record to its last one inside the
 * range. None when no turn in the range changed it.
 */
function repositoryDiffRange(
  checkpoints: ReadonlyArray<ContextCheckpoint>,
  range: { readonly fromTurnCount: number; readonly toTurnCount: number },
): { readonly from: ContextCheckpoint; readonly to: ContextCheckpoint } | undefined {
  const ready = checkpoints
    .filter(
      (checkpoint) =>
        checkpoint.status === "ready" &&
        checkpoint.ordinalWithinScope >= range.fromTurnCount &&
        checkpoint.ordinalWithinScope <= range.toTurnCount,
    )
    .toSorted((left, right) => left.ordinalWithinScope - right.ordinalWithinScope);
  const from = ready[0];
  const to = ready.at(-1);
  return from === undefined || to === undefined || from === to ? undefined : { from, to };
}

/** @public */
export const make = Effect.gen(function* () {
  const threads = yield* ThreadManagement.ThreadManagementService;
  const checkpointStore = yield* CheckpointStore.CheckpointStore;
  const digest = yield* Digest.Digest;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  interface Comparison {
    readonly cwd: string;
    readonly fromCheckpointRef: CheckpointRef;
    readonly toCheckpointRef: CheckpointRef;
    readonly fallbackFromToHead: false;
    readonly ignoreWhitespace: boolean;
    readonly excludePaths?: ReadonlyArray<string>;
  }

  // What a pull or rebase brought in is not the turn's work. Null keeps every changed file.
  const retainedFilePaths = Effect.fn("CheckpointDiffQuery.retainedFilePaths")(function* (
    comparison: Comparison,
  ) {
    const authoredPaths = yield* checkpointStore
      .listAuthoredPaths(comparison)
      .pipe(Effect.orElseSucceed(() => null));
    const files =
      authoredPaths === null
        ? []
        : yield* checkpointStore.diffCheckpoints({ ...comparison, format: "numstat" }).pipe(
            Effect.map(parseTurnDiffFilesFromNumstat),
            Effect.orElseSucceed(() => []),
          );
    const retainedFiles = files.filter((file) => !isGitImport(file, authoredPaths));
    return retainedFiles.length === files.length ? null : retainedFiles;
  });

  // Selects retained paths before generating a patch, so imported bulk cannot exhaust the limit.
  const patchBetween = Effect.fn("CheckpointDiffQuery.patchBetween")(function* (
    comparison: Comparison,
    maxBytes: number,
  ) {
    const retainedFiles = yield* retainedFilePaths(comparison);
    const pathBatches = retainedFiles === null ? [undefined] : batchFilePaths(retainedFiles);
    let diff = "";
    let remainingBytes = maxBytes;
    for (const filePaths of pathBatches) {
      const patch = yield* checkpointStore
        .diffCheckpoints({
          ...comparison,
          ...(filePaths === undefined ? {} : { filePaths }),
          // One extra byte distinguishes an exact fit from a truncated patch.
          maxOutputBytes: remainingBytes + 1,
        })
        .pipe(Effect.withSpan("checkpoint.turnDiff.diffCheckpoints"));
      const patchBytes = Buffer.byteLength(patch);
      diff += patch;
      if (patchBytes > remainingBytes) {
        // Reserve marker space only on overflow, which may trim an earlier batch.
        // Streaming decode drops an incomplete final UTF-8 character at the byte boundary.
        diff =
          new TextDecoder().decode(
            Buffer.from(diff).subarray(
              0,
              Math.max(0, maxBytes - Buffer.byteLength(CHECKPOINT_DIFF_TRUNCATED_MARKER)),
            ),
            { stream: true },
          ) + CHECKPOINT_DIFF_TRUNCATED_MARKER;
        break;
      }
      remainingBytes -= patchBytes;
    }
    return diff;
  });

  // A tracked repository's comparison from its own checkpoints; none when no turn changed it.
  const repositoryComparison = (
    input: {
      readonly projection: ProjectionCheckpointContext;
      readonly fromTurnCount: number;
      readonly toTurnCount: number;
      readonly ignoreWhitespace: boolean;
      readonly nested: ReadonlyMap<string, ReadonlyArray<string>>;
    },
    scope: ProjectionCheckpointContext["checkpointScopes"][number],
  ): Comparison | undefined => {
    const range = repositoryDiffRange(
      input.projection.checkpoints.filter((checkpoint) => checkpoint.scopeId === scope.id),
      input,
    );
    if (range === undefined) return undefined;
    const excludePaths = input.nested.get(scope.id);
    return {
      cwd: scope.cwd,
      fromCheckpointRef: range.from.ref,
      toCheckpointRef: range.to.ref,
      fallbackFromToHead: false,
      ignoreWhitespace: input.ignoreWhitespace,
      ...(excludePaths === undefined ? {} : { excludePaths }),
    };
  };

  // Most tracked repositories are untouched in a turn. A numstat finds the few that changed
  // before any patch is built, and those patches then share what the thread's own patch left.
  const repositoryDiffs = Effect.fn("CheckpointDiffQuery.repositoryDiffs")(function* (input: {
    readonly projection: ProjectionCheckpointContext;
    readonly threadCwd: string;
    readonly fromTurnCount: number;
    readonly toTurnCount: number;
    readonly ignoreWhitespace: boolean;
    readonly nested: ReadonlyMap<string, ReadonlyArray<string>>;
    readonly maxBytes: number;
  }) {
    const changed = yield* Effect.forEach(
      input.projection.checkpointScopes.filter((scope) => typeof scope.repositoryPath === "string"),
      (scope) => {
        const comparison = repositoryComparison(input, scope);
        if (comparison === undefined) return Effect.succeed([]);
        return checkpointStore.diffCheckpoints({ ...comparison, format: "numstat" }).pipe(
          Effect.map((numstat) => (numstat === "" ? [] : [{ scope, comparison }])),
          Effect.catch((cause) =>
            Effect.logWarning("checkpoint repository diff unavailable", {
              scopeId: scope.id,
              cause: String(cause),
            }).pipe(Effect.as([])),
          ),
        );
      },
      { concurrency: REPOSITORY_DIFF_CONCURRENCY },
    );
    const repositories: Array<ThreadTurnRepositoryDiff> = [];
    let remainingBytes = input.maxBytes;
    for (const { scope, comparison } of changed.flat()) {
      const diff = yield* patchBetween(comparison, remainingBytes).pipe(
        Effect.catch((cause) =>
          Effect.logWarning("checkpoint repository diff unavailable", {
            scopeId: scope.id,
            cause: String(cause),
          }).pipe(Effect.as("")),
        ),
      );
      if (diff === "") continue;
      remainingBytes = Math.max(0, remainingBytes - Buffer.byteLength(diff));
      repositories.push({
        name: scope.label ?? path.basename(scope.cwd),
        repositoryPath: scope.repositoryPath ?? scope.cwd,
        relativePath: path.relative(input.threadCwd, scope.cwd).split(path.sep).join("/"),
        diff,
      });
    }
    return repositories;
  });

  // A turn range as the diff reads it: the thread folder's comparison (null when that folder has
  // no snapshot for it) and the folders inside it with checkpoints of their own.
  const resolveTurnRange = Effect.fn("CheckpointDiffQuery.resolveTurnRange")(function* (
    input: {
      readonly threadId: ThreadId;
      readonly fromTurnCount: number;
      readonly toTurnCount: number;
      readonly ignoreWhitespace: boolean;
    },
    operation: CheckpointDiffOperation,
  ) {
    const projection = yield* threads.getCheckpointContext(input.threadId).pipe(
      Effect.mapError(
        () =>
          new CheckpointThreadNotFoundError({
            operation,
            threadId: input.threadId,
          }),
      ),
      Effect.withSpan("checkpoint.turnDiff.lookupContext"),
    );
    const completedRunIds = new Set(
      projection.runs.filter((run) => run.status === "completed").map((run) => run.id),
    );
    const hasRepositories = projection.checkpointScopes.some(
      (scope) => typeof scope.repositoryPath === "string",
    );
    // A thread folder that is not a Git repository records missing checkpoints; its turns still
    // exist, for the repositories inside it and as an empty patch while none of them changed.
    const turnCheckpoints = projection.checkpoints.filter(
      (checkpoint) =>
        (checkpoint.status === "ready" || checkpoint.status === "missing") &&
        checkpoint.appRunOrdinal !== null &&
        checkpoint.runId !== null &&
        completedRunIds.has(checkpoint.runId),
    );
    const readyCheckpoints = turnCheckpoints.filter((checkpoint) => checkpoint.status === "ready");
    const maxTurnCount = turnCheckpoints.reduce(
      (max, checkpoint) => Math.max(max, checkpoint.appRunOrdinal ?? 0),
      0,
    );
    if (input.toTurnCount > maxTurnCount) {
      return yield* new CheckpointTurnRangeUnavailableError({
        operation,
        threadId: input.threadId,
        requestedTurnCount: input.toTurnCount,
        availableTurnCount: maxTurnCount,
      });
    }

    const toCheckpoint = turnCheckpoints.find(
      (checkpoint) => checkpoint.appRunOrdinal === input.toTurnCount,
    );
    if (toCheckpoint === undefined) {
      return yield* new CheckpointRefUnavailableError({
        operation,
        threadId: input.threadId,
        turnCount: input.toTurnCount,
        checkpoint: "to",
      });
    }

    const toScope = projection.checkpointScopes.find((scope) => scope.id === toCheckpoint.scopeId);
    if (toScope === undefined) {
      return yield* new CheckpointWorkspacePathMissingError({
        operation,
        threadId: input.threadId,
      });
    }

    const nested = hasRepositories
      ? yield* nestedScopePaths([
          toScope,
          // A folder that became a repository after the range still belongs to the thread's patch.
          ...projection.checkpointScopes.filter(
            (scope) =>
              typeof scope.repositoryPath === "string" &&
              projection.checkpoints.some(
                (checkpoint) =>
                  checkpoint.scopeId === scope.id &&
                  checkpoint.ordinalWithinScope <= input.toTurnCount,
              ),
          ),
        ]).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
        )
      : undefined;
    if (toCheckpoint.status === "missing") {
      return { projection, toScope, nested, comparison: null };
    }

    // Capture compares against the preceding scope ordinal, even when that
    // checkpoint belongs to a stopped run or has no run.
    const parentCheckpoint =
      input.fromTurnCount === input.toTurnCount - 1
        ? projection.checkpoints.find(
            (checkpoint) =>
              checkpoint.status === "ready" &&
              checkpoint.scopeId === toCheckpoint.scopeId &&
              checkpoint.ordinalWithinScope === toCheckpoint.ordinalWithinScope - 1,
          )
        : undefined;

    const firstScope =
      input.fromTurnCount === 0
        ? projection.checkpointScopes.find((scope) => scope.kind === "root_run")
        : undefined;
    const fromCheckpointRef =
      input.fromTurnCount === 0
        ? firstScope === undefined
          ? undefined
          : yield* checkpointRefForScopeOrdinal({
              scopeId: firstScope.id,
              ordinalWithinScope: 0,
            }).pipe(Effect.provideService(Digest.Digest, digest))
        : (
            parentCheckpoint ??
            readyCheckpoints.find((checkpoint) => checkpoint.appRunOrdinal === input.fromTurnCount)
          )?.ref;
    if (fromCheckpointRef === undefined) {
      return yield* new CheckpointRefUnavailableError({
        operation,
        threadId: input.threadId,
        turnCount: input.fromTurnCount,
        checkpoint: "from",
      });
    }

    const excludePaths = nested?.get(toScope.id);
    const comparison: Comparison = {
      cwd: toScope.cwd,
      fromCheckpointRef,
      toCheckpointRef: toCheckpoint.ref,
      fallbackFromToHead: false,
      ignoreWhitespace: input.ignoreWhitespace,
      ...(excludePaths === undefined ? {} : { excludePaths }),
    };
    return { projection, toScope, nested, comparison };
  });

  const getTurnDiff: CheckpointDiffQuery["Service"]["getTurnDiff"] = Effect.fn("getTurnDiff")(
    function* (input) {
      const operation = "CheckpointDiffQuery.getTurnDiff";
      const ignoreWhitespace = input.ignoreWhitespace ?? true;
      yield* Effect.annotateCurrentSpan({
        "checkpoint.thread_id": input.threadId,
        "checkpoint.from_turn_count": input.fromTurnCount,
        "checkpoint.to_turn_count": input.toTurnCount,
        "checkpoint.ignore_whitespace": ignoreWhitespace,
      });

      if (input.fromTurnCount === input.toTurnCount) {
        const emptyDiff = buildTurnDiffResult(input, "");
        if (!isTurnDiffResult(emptyDiff)) {
          return yield* new CheckpointDiffResultInvalidError({
            operation,
            threadId: input.threadId,
          });
        }
        return emptyDiff;
      }

      const { projection, toScope, nested, comparison } = yield* resolveTurnRange(
        { ...input, ignoreWhitespace },
        operation,
      );
      const withRepositories = Effect.fnUntraced(function* (diff: string) {
        const repositories =
          nested === undefined
            ? undefined
            : yield* repositoryDiffs({
                projection,
                threadCwd: toScope.cwd,
                fromTurnCount: input.fromTurnCount,
                toTurnCount: input.toTurnCount,
                ignoreWhitespace,
                nested,
                maxBytes: Math.max(0, CHECKPOINT_DIFF_MAX_OUTPUT_BYTES - Buffer.byteLength(diff)),
              });
        const turnDiff = buildTurnDiffResult(input, diff, repositories);
        if (!isTurnDiffResult(turnDiff)) {
          return yield* new CheckpointDiffResultInvalidError({
            operation,
            threadId: input.threadId,
          });
        }
        return turnDiff;
      });
      if (comparison === null) return yield* withRepositories("");
      return yield* withRepositories(
        yield* patchBetween(comparison, CHECKPOINT_DIFF_MAX_OUTPUT_BYTES),
      );
    },
  );

  const revertFiles: CheckpointDiffQuery["Service"]["revertFiles"] = Effect.fn(
    "CheckpointDiffQuery.revertFiles",
  )(function* (input) {
    const operation = "CheckpointDiffQuery.revertFiles";
    yield* Effect.annotateCurrentSpan({
      "checkpoint.thread_id": input.threadId,
      "checkpoint.from_turn_count": input.fromTurnCount,
      "checkpoint.to_turn_count": input.toTurnCount,
      "checkpoint.path_count": input.paths.length,
    });
    const refuse = (reason: CheckpointFileRevertRefusedError["reason"], file?: string) =>
      new CheckpointFileRevertRefusedError({
        threadId: input.threadId,
        reason,
        ...(file === undefined ? {} : { path: file }),
      });
    for (const file of input.paths) {
      const segments = file.split("/");
      if (path.isAbsolute(file) || segments.some((segment) => ["", ".", ".."].includes(segment))) {
        return yield* refuse("outside-workspace", file);
      }
      if (segments.some(isGitMetadataName)) return yield* refuse("git-metadata", file);
    }
    // Whitespace-only changes are changes too.
    const range =
      input.fromTurnCount === input.toTurnCount
        ? null
        : yield* resolveTurnRange({ ...input, ignoreWhitespace: false }, operation);
    // A tracked repository's files compare its own checkpoints.
    const repository =
      input.repositoryPath === undefined
        ? undefined
        : range?.projection.checkpointScopes.find(
            (scope) => scope.repositoryPath === input.repositoryPath,
          );
    const comparison =
      input.repositoryPath === undefined
        ? range?.comparison
        : range &&
          repository &&
          repositoryComparison(
            {
              ...input,
              projection: range.projection,
              nested: range.nested ?? new Map(),
              ignoreWhitespace: false,
            },
            repository,
          );
    if (!comparison) return yield* refuse("not-changed", input.paths[0]);

    return yield* withCheckpointRestoreReservation(
      fileSystem,
      path,
      comparison.cwd,
      Effect.gen(function* () {
        // Read once reserved: a turn that was starting until now shows as running.
        const { runs } = yield* threads
          .getCheckpointContext(input.threadId)
          .pipe(
            Effect.mapError(
              () => new CheckpointThreadNotFoundError({ operation, threadId: input.threadId }),
            ),
          );
        if (runs.some(ThreadManagement.isActiveRun)) return yield* refuse("turn-running");

        // The files the panel's diff lists: what Git brought in by a pull or rebase is left out.
        const authoredPaths = yield* checkpointStore
          .listAuthoredPaths(comparison)
          .pipe(Effect.orElseSucceed(() => null));
        const listed = new Set(
          parseTurnDiffFilesFromNumstat(
            yield* checkpointStore.diffCheckpoints({ ...comparison, format: "numstat" }),
          )
            .filter((file) => !isGitImport(file, authoredPaths))
            .flatMap((file) =>
              file.previousPath === undefined ? [file.path] : [file.previousPath, file.path],
            ),
        );
        const unlisted = input.paths.find((file) => !listed.has(file));
        if (unlisted !== undefined) return yield* refuse("not-changed", unlisted);

        // Git replaces a symbolic link or file it meets on the way, and a folder at the path
        // goes with its contents, so either would change another path.
        const root = yield* fileSystem.realPath(
          yield* checkpointStore.repositoryRoot(comparison.cwd),
        );
        const workspace = yield* fileSystem.realPath(comparison.cwd);
        for (const file of input.paths) {
          const relative = path.relative(workspace, path.join(root, ...file.split("/")));
          if (
            relative === "" ||
            relative === ".." ||
            relative.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relative)
          ) {
            return yield* refuse("outside-workspace", file);
          }
          const parts = relative.split(path.sep);
          if (parts.some(isGitMetadataName)) return yield* refuse("git-metadata", file);
          let current = workspace;
          for (const [index, part] of parts.entries()) {
            current = path.join(current, part);
            const info = yield* fileSystem
              .lstat(current)
              .pipe(Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(null)));
            if (info === null) break;
            const leaf = index === parts.length - 1;
            if (!leaf && info.type === "SymbolicLink") return yield* refuse("symlink", file);
            if (leaf ? info.type === "Directory" : info.type !== "Directory") {
              return yield* refuse("in-the-way", file);
            }
          }
        }
        return yield* checkpointStore.restoreCheckpointPaths({ ...comparison, paths: input.paths });
      }),
    );
  });

  const getFullThreadDiff: CheckpointDiffQuery["Service"]["getFullThreadDiff"] = Effect.fn(
    "CheckpointDiffQuery.getFullThreadDiff",
  )(function* (input) {
    const operation = "CheckpointDiffQuery.getFullThreadDiff";
    const ignoreWhitespace = input.ignoreWhitespace ?? true;
    yield* Effect.annotateCurrentSpan({
      "checkpoint.thread_id": input.threadId,
      "checkpoint.from_turn_count": 0,
      "checkpoint.to_turn_count": input.toTurnCount,
      "checkpoint.ignore_whitespace": ignoreWhitespace,
      "checkpoint.diff_kind": "full-thread",
    });

    if (input.toTurnCount === 0) {
      const emptyDiff = buildTurnDiffResult(
        {
          threadId: input.threadId,
          fromTurnCount: 0,
          toTurnCount: 0,
        },
        "",
      );
      if (!isTurnDiffResult(emptyDiff)) {
        return yield* new CheckpointDiffResultInvalidError({
          operation,
          threadId: input.threadId,
        });
      }
      return emptyDiff satisfies OrchestrationGetFullThreadDiffResult;
    }

    const turnDiff = yield* getTurnDiff({
      threadId: input.threadId,
      fromTurnCount: 0,
      toTurnCount: input.toTurnCount,
      ignoreWhitespace,
    });
    if (!isTurnDiffResult(turnDiff)) {
      return yield* new CheckpointDiffResultInvalidError({
        operation,
        threadId: input.threadId,
      });
    }

    return turnDiff satisfies OrchestrationGetFullThreadDiffResult;
  });

  return CheckpointDiffQuery.of({
    getTurnDiff,
    getFullThreadDiff,
    revertFiles,
  });
});

export const layer = Layer.effect(CheckpointDiffQuery, make);
