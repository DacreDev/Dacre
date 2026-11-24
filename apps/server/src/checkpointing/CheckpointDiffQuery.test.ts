import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it, vi } from "@effect/vitest";
import { CheckpointRef, CheckpointScopeId, RunId, ThreadId } from "@dacre/contracts";
import { symlinksSupported } from "@dacre/shared/testing/symlinks";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { checkpointRefForScopeOrdinal } from "../orchestration-v2/CheckpointService.ts";
import { OrchestratorProjectionError } from "../orchestration-v2/Orchestrator.ts";
import type { ProjectionCheckpointContext } from "../orchestration-v2/ProjectionStore.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as CheckpointDiffQuery from "./CheckpointDiffQuery.ts";
import * as CheckpointStore from "./CheckpointStore.ts";
import { CheckpointRefUnavailableError, CheckpointTurnRangeUnavailableError } from "./Errors.ts";

const threadId = ThreadId.make("thread:checkpoint-diff-v2");
const firstRunId = RunId.make("run:checkpoint-diff-v2:1");
const secondRunId = RunId.make("run:checkpoint-diff-v2:2");
const firstScopeId = CheckpointScopeId.make("scope:checkpoint-diff-v2:1");
const secondScopeId = CheckpointScopeId.make("scope:checkpoint-diff-v2:2");
const secondRef = CheckpointRef.make("refs/dacre/test/second");

function makeProjection(): ProjectionCheckpointContext {
  return {
    runs: [
      { id: firstRunId, ordinal: 1, status: "completed" },
      { id: secondRunId, ordinal: 2, status: "completed" },
    ],
    checkpointScopes: [
      { id: firstScopeId, runId: firstRunId, kind: "root_run", cwd: "/repo" },
      { id: secondScopeId, runId: secondRunId, kind: "root_run", cwd: "/repo" },
    ],
    checkpoints: [
      {
        scopeId: secondScopeId,
        runId: secondRunId,
        ordinalWithinScope: 1,
        appRunOrdinal: 2,
        status: "ready",
        ref: secondRef,
      },
    ],
  };
}

function layerFor(input: {
  readonly projection: Effect.Effect<ProjectionCheckpointContext, OrchestratorProjectionError>;
  readonly diffCheckpoints?: CheckpointStore.CheckpointStore["Service"]["diffCheckpoints"];
  readonly authoredPaths?: ReadonlySet<string>;
}) {
  return CheckpointDiffQuery.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(ThreadManagement.ThreadManagementService)({
          getCheckpointContext: () => input.projection,
        }),
        Layer.mock(CheckpointStore.CheckpointStore)({
          diffCheckpoints: input.diffCheckpoints ?? (() => Effect.succeed("diff")),
          listAuthoredPaths: () => Effect.succeed(input.authoredPaths ?? null),
        }),
      ),
    ),
    Layer.provideMerge(Layer.merge(NodeCrypto.layer, NodeServices.layer)),
  );
}

it.effect("excludes ready checkpoints from rolled-back runs", () => {
  const projection = makeProjection();
  const layer = layerFor({
    projection: Effect.succeed({
      ...projection,
      runs: projection.runs.map((run) =>
        run.id === secondRunId ? { ...run, status: "rolled_back" as const } : run,
      ),
      checkpoints: [
        {
          ...projection.checkpoints[0]!,
          scopeId: firstScopeId,
          runId: firstRunId,
          appRunOrdinal: 1,
          ref: CheckpointRef.make("refs/dacre/test/first"),
        },
        ...projection.checkpoints,
      ],
    }),
  });

  return Effect.gen(function* () {
    const query = yield* CheckpointDiffQuery.CheckpointDiffQuery;
    const error = yield* query
      .getTurnDiff({ threadId, fromTurnCount: 0, toTurnCount: 2 })
      .pipe(Effect.flip);

    assert.instanceOf(error, CheckpointTurnRangeUnavailableError);
    assert.deepEqual(
      {
        requestedTurnCount: error.requestedTurnCount,
        availableTurnCount: error.availableTurnCount,
      },
      { requestedTurnCount: 2, availableTurnCount: 1 },
    );
  }).pipe(Effect.provide(layer));
});

function makeProjectionAfterStoppedRun(stoppedRunCheckpoint: boolean) {
  const thirdRunId = RunId.make("run:checkpoint-diff-v2:3");
  const checkpoint = (
    ordinalWithinScope: number,
    runId: RunId | null,
  ): ProjectionCheckpointContext["checkpoints"][number] => ({
    scopeId: firstScopeId,
    runId,
    ordinalWithinScope,
    appRunOrdinal: runId === null ? null : ordinalWithinScope,
    status: "ready",
    ref: CheckpointRef.make(`refs/dacre/test/ordinal/${ordinalWithinScope}`),
  });
  return {
    runs: [
      { id: firstRunId, ordinal: 1, status: "completed" },
      { id: secondRunId, ordinal: 2, status: "interrupted" },
      { id: thirdRunId, ordinal: 3, status: "completed" },
    ],
    checkpointScopes: [
      { id: firstScopeId, runId: thirdRunId, kind: "root_run", cwd: "/repo" },
      { id: secondScopeId, runId: secondRunId, kind: "tool", cwd: "/repo" },
    ],
    checkpoints: [
      {
        ...checkpoint(2, null),
        scopeId: secondScopeId,
        ref: CheckpointRef.make("refs/dacre/test/tool/2"),
      },
      checkpoint(0, null),
      checkpoint(1, firstRunId),
      checkpoint(2, stoppedRunCheckpoint ? secondRunId : null),
      checkpoint(3, thirdRunId),
    ],
  } satisfies ProjectionCheckpointContext;
}

it.effect.each([false, true])(
  "diffs the turn after a stopped run from its parent checkpoint (stopped run captured: %s)",
  (stoppedRunCheckpoint) => {
    const diffCheckpoints = vi.fn((_input: CheckpointStore.DiffCheckpointsInput) =>
      Effect.succeed("diff --git a/file b/file"),
    );
    const layer = layerFor({
      projection: Effect.succeed(makeProjectionAfterStoppedRun(stoppedRunCheckpoint)),
      diffCheckpoints,
    });

    return Effect.gen(function* () {
      const query = yield* CheckpointDiffQuery.CheckpointDiffQuery;
      const result = yield* query.getTurnDiff({ threadId, fromTurnCount: 2, toTurnCount: 3 });

      assert.strictEqual(result.diff, "diff --git a/file b/file");
      yield* query.getTurnDiff({ threadId, fromTurnCount: 1, toTurnCount: 3 });
      yield* query.getFullThreadDiff({ threadId, toTurnCount: 3 });
      assert.deepEqual(
        diffCheckpoints.mock.calls.map(([input]) => ({
          from: input.fromCheckpointRef,
          to: input.toCheckpointRef,
        })),
        [
          { from: "refs/dacre/test/ordinal/2", to: "refs/dacre/test/ordinal/3" },
          { from: "refs/dacre/test/ordinal/1", to: "refs/dacre/test/ordinal/3" },
          {
            from: yield* checkpointRefForScopeOrdinal({
              scopeId: firstScopeId,
              ordinalWithinScope: 0,
            }),
            to: "refs/dacre/test/ordinal/3",
          },
        ],
      );
      const stoppedTurnError = yield* query
        .getTurnDiff({ threadId, fromTurnCount: 1, toTurnCount: 2 })
        .pipe(Effect.flip);
      assert.instanceOf(stoppedTurnError, CheckpointRefUnavailableError);
      assert.deepEqual(
        { checkpoint: stoppedTurnError.checkpoint, turnCount: stoppedTurnError.turnCount },
        { checkpoint: "to", turnCount: 2 },
      );
    }).pipe(Effect.provide(layer));
  },
);

const layerVcsProcess = VcsProcess.layer.pipe(Layer.provide(NodeServices.layer));
const layerStore = CheckpointStore.layer.pipe(
  Layer.provide(VcsDriverRegistry.layer.pipe(Layer.provide(layerVcsProcess))),
  Layer.provide(NodeServices.layer),
);
const layerTest = Layer.merge(layerStore, layerVcsProcess).pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(NodeCrypto.layer),
);

it.effect("shares the turn and full-thread diff budget across real Git batches", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const process = yield* VcsProcess.VcsProcess;
    const store = yield* CheckpointStore.CheckpointStore;
    const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "dacre-diff-aggregate-" });
    const git = (args: ReadonlyArray<string>, env?: NodeJS.ProcessEnv) =>
      process.run({
        operation: "CheckpointDiffQuery.test.git",
        command: "git",
        cwd,
        args,
        ...(env === undefined ? {} : { env }),
      });
    yield* git(["init"]);
    yield* git(["config", "user.email", "test@test.com"]);
    yield* git(["config", "user.name", "Test"]);
    yield* fs.writeFileString(path.join(cwd, "README.md"), "initial\n");
    yield* git(["add", "."]);
    yield* git(["commit", "-m", "initial"]);

    const threadId = ThreadId.make("thread:aggregate-runtime");
    const runId = RunId.make("run:aggregate-runtime");
    const scopeId = CheckpointScopeId.make("scope:aggregate-runtime");
    const fromCheckpointRef = yield* checkpointRefForScopeOrdinal({
      scopeId,
      ordinalWithinScope: 0,
    });
    const toCheckpointRef = CheckpointRef.make("refs/dacre/test/aggregate-after");
    yield* store.captureCheckpoint({ cwd, checkpointRef: fromCheckpointRef });
    // The old commit models files imported by a pull after the baseline was captured.
    yield* fs.writeFileString(path.join(cwd, "upstream.ts"), "imported\n");
    yield* git(["add", "."]);
    yield* git(["commit", "-m", "imported"], {
      ...globalThis.process.env,
      GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
    });
    const ownPaths = Array.from({ length: 1_600 }, (_, index) => `src/module-${index}/file.ts`);
    yield* Effect.forEach(
      ownPaths,
      (file) =>
        Effect.gen(function* () {
          yield* fs.makeDirectory(path.dirname(path.join(cwd, file)), { recursive: true });
          yield* fs.writeFileString(path.join(cwd, file), `${"x".repeat(12_000)}\n`);
        }),
      { concurrency: 16, discard: true },
    );
    yield* store.captureCheckpoint({ cwd, checkpointRef: toCheckpointRef });

    const patchSizes: number[] = [];
    const query = yield* CheckpointDiffQuery.make.pipe(
      Effect.provide(
        Layer.mock(ThreadManagement.ThreadManagementService)({
          getCheckpointContext: () =>
            Effect.succeed({
              runs: [{ id: runId, ordinal: 1, status: "completed" }],
              checkpointScopes: [{ id: scopeId, runId, kind: "root_run", cwd }],
              checkpoints: [
                {
                  scopeId,
                  runId,
                  ordinalWithinScope: 1,
                  appRunOrdinal: 1,
                  status: "ready",
                  ref: toCheckpointRef,
                },
              ],
            }),
        }),
      ),
      Effect.provideService(CheckpointStore.CheckpointStore, {
        ...store,
        diffCheckpoints: (input) =>
          store.diffCheckpoints(input).pipe(
            Effect.tap((patch) =>
              Effect.sync(() => {
                if (input.format !== "numstat") {
                  patchSizes.push(Buffer.byteLength(patch));
                }
              }),
            ),
          ),
      }),
    );
    const turn = yield* query.getTurnDiff({ threadId, fromTurnCount: 0, toTurnCount: 1 });
    const turnPatchSizes = patchSizes.splice(0);
    const fullThread = yield* query.getFullThreadDiff({ threadId, toTurnCount: 1 });
    assert.isTrue(fullThread.diff === turn.diff);
    assert.isAtMost(Buffer.byteLength(turn.diff), 10_000_000);
    assert.isTrue(turn.diff.endsWith("\n\n[truncated]"));
    assert.include(turn.diff, "src/module-0/file.ts");
    assert.notInclude(turn.diff, "upstream.ts");
    assert.lengthOf(turnPatchSizes, 2);
    assert.deepEqual(patchSizes, turnPatchSizes);
    assert.isBelow(turnPatchSizes[0]!, 10_000_000);
    assert.strictEqual(
      turnPatchSizes.reduce((sum, size) => sum + size, 0),
      10_000_001,
    );
  }).pipe(Effect.provide(layerTest)),
);

it.effect("truncates a storage-cut UTF-8 character without replacement text", () => {
  const prefix = "x".repeat(9_999_985);
  const layer = layerFor({
    projection: Effect.succeed(makeProjection()),
    diffCheckpoints: (input) =>
      Effect.succeed(
        Buffer.from(`${prefix}😀${"x".repeat(9)}😀tail`)
          .subarray(0, input.maxOutputBytes)
          .toString("utf8"),
      ),
  });
  return Effect.gen(function* () {
    const query = yield* CheckpointDiffQuery.CheckpointDiffQuery;
    const result = yield* query.getTurnDiff({ threadId, fromTurnCount: 0, toTurnCount: 2 });
    assert.isAtMost(Buffer.byteLength(result.diff), 10_000_000);
    assert.isTrue(result.diff === `${prefix}\n\n[truncated]`);
    // A thread without tracked repositories keeps the payload it always had.
    assert.notProperty(result, "repositories");
  }).pipe(Effect.provide(layer));
});

it.effect("preserves an exact-fit filtered patch across batches without a marker", () => {
  const ownPaths = Array.from({ length: 1_000 }, (_, index) => `src/module-${index}/file.ts`);
  const patches = ["é".repeat(3_000_000), "x".repeat(4_000_000)];
  let patchReads = 0;
  const layer = layerFor({
    projection: Effect.succeed(makeProjection()),
    authoredPaths: new Set(ownPaths),
    diffCheckpoints: (input) =>
      Effect.sync(() =>
        input.format === "numstat"
          ? [...ownPaths, "upstream.ts"].map((path) => `1\t0\t${path}\0`).join("")
          : patches[patchReads++]!,
      ),
  });
  return Effect.gen(function* () {
    const query = yield* CheckpointDiffQuery.CheckpointDiffQuery;
    const result = yield* query.getFullThreadDiff({ threadId, toTurnCount: 2 });
    assert.isTrue(result.diff === patches.join(""));
    assert.strictEqual(patchReads, 2);
  }).pipe(Effect.provide(layer));
});

it.effect("adds a patch for each tracked repository that changed in the range", () => {
  const projection = makeProjection();
  const repository = (name: string, cwd: string, ordinals: ReadonlyArray<number>) => {
    const id = CheckpointScopeId.make(`scope:checkpoint-diff-v2:${name}`);
    return {
      scope: {
        id,
        runId: firstRunId,
        kind: "manual" as const,
        cwd,
        label: name,
        repositoryPath: cwd,
      },
      checkpoints: ordinals.map((ordinalWithinScope) => ({
        scopeId: id,
        runId: ordinalWithinScope === 2 ? secondRunId : null,
        ordinalWithinScope,
        appRunOrdinal: null,
        status: "ready" as const,
        ref: CheckpointRef.make(`refs/dacre/test/${name}/${ordinalWithinScope}`),
      })),
    };
  };
  const sibling = repository("shared", "/work/shared", [1, 2]);
  // Nothing before the range's end, so there is no patch to make.
  const nested = repository("ui", "/work/app/packages/ui", [2]);
  // Became a repository after the range, so the thread's own patch still covers its folder.
  const later = repository("later", "/work/app/packages/later", [3]);
  const diffCheckpoints = vi.fn((input: CheckpointStore.DiffCheckpointsInput) =>
    Effect.succeed(input.format === "numstat" ? "1\t0\tfile.ts\0" : `patch of ${input.cwd}`),
  );
  const layer = layerFor({
    projection: Effect.succeed({
      ...projection,
      checkpointScopes: [
        ...projection.checkpointScopes.map((scope) => ({ ...scope, cwd: "/work/app" })),
        sibling.scope,
        nested.scope,
        later.scope,
      ],
      checkpoints: [
        ...projection.checkpoints,
        ...sibling.checkpoints,
        ...nested.checkpoints,
        ...later.checkpoints,
      ],
    }),
    diffCheckpoints,
  });
  return Effect.gen(function* () {
    const query = yield* CheckpointDiffQuery.CheckpointDiffQuery;
    const result = yield* query.getTurnDiff({ threadId, fromTurnCount: 0, toTurnCount: 2 });
    assert.deepEqual(result.repositories, [
      {
        name: "shared",
        repositoryPath: "/work/shared",
        relativePath: "../shared",
        diff: "patch of /work/shared",
      },
    ]);
    // The thread's own patch leaves the folder of the repository inside it alone.
    assert.strictEqual(result.diff, "patch of /work/app");
    assert.deepEqual(
      diffCheckpoints.mock.calls.find(([input]) => input.cwd === "/work/app")?.[0].excludePaths,
      ["packages/ui"],
    );
  }).pipe(Effect.provide(layer));
});

// A thread working in `app/` of a repository, whose first turn changed files inside and outside it.
const makeRevertFixture = Effect.fn("makeRevertFixture")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const process = yield* VcsProcess.VcsProcess;
  const store = yield* CheckpointStore.CheckpointStore;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "dacre-revert-files-" });
  const cwd = path.join(root, "app");
  const git = (args: ReadonlyArray<string>) =>
    process.run({ operation: "CheckpointDiffQuery.test.git", command: "git", cwd: root, args });
  const write = (file: string, contents: string) =>
    fs
      .makeDirectory(path.dirname(path.join(root, file)), { recursive: true })
      .pipe(Effect.andThen(fs.writeFileString(path.join(root, file), contents)));
  const read = (file: string) => fs.readFileString(path.join(root, file));
  yield* git(["init"]);
  yield* git(["config", "user.email", "test@test.com"]);
  yield* git(["config", "user.name", "Test"]);
  for (const file of ["README.md", "app/keep.txt", "app/modified.txt"]) {
    yield* write(file, "before\n");
  }
  yield* git(["add", "."]);
  yield* git(["commit", "-m", "initial"]);
  const runId = RunId.make("run:revert-files:1");
  const scopeId = CheckpointScopeId.make("scope:revert-files");
  const toCheckpointRef = CheckpointRef.make("refs/dacre/test/revert-files-after");
  yield* store.captureCheckpoint({
    cwd,
    checkpointRef: yield* checkpointRefForScopeOrdinal({ scopeId, ordinalWithinScope: 0 }),
  });
  yield* write("app/modified.txt", "turn\n");
  yield* write("app/sub/new.txt", "turn\n");
  yield* write("README.md", "turn\n");
  yield* git(["add", "README.md"]);
  yield* git(["commit", "-m", "readme"]);
  yield* store.captureCheckpoint({ cwd, checkpointRef: toCheckpointRef });

  const runs: Array<ProjectionCheckpointContext["runs"][number]> = [
    { id: runId, ordinal: 1, status: "completed" },
  ];
  const query = yield* CheckpointDiffQuery.make.pipe(
    Effect.provide(
      Layer.mock(ThreadManagement.ThreadManagementService)({
        getCheckpointContext: () =>
          Effect.sync(() => ({
            runs: [...runs],
            checkpointScopes: [{ id: scopeId, runId, kind: "root_run", cwd }],
            checkpoints: [
              {
                scopeId,
                runId,
                ordinalWithinScope: 1,
                appRunOrdinal: 1,
                status: "ready",
                ref: toCheckpointRef,
              },
            ],
          })),
      }),
    ),
  );
  const revert = (paths: ReadonlyArray<string>) =>
    query.revertFiles({ threadId, fromTurnCount: 0, toTurnCount: 1, paths });
  const refusal = (paths: ReadonlyArray<string>) =>
    revert(paths).pipe(
      Effect.flip,
      Effect.map((error) => ("reason" in error ? error.reason : error._tag)),
    );
  return { root, cwd, runs, read, revert, refusal };
});

it.effect("reverts a file only inside the thread's folder, as the range changed it", () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const { cwd, runs, read, revert, refusal } = yield* makeRevertFixture();

    assert.strictEqual(yield* refusal([path.join(cwd, "modified.txt")]), "outside-workspace");
    assert.strictEqual(yield* refusal(["app/../README.md"]), "outside-workspace");
    // The turn committed it, so the diff lists it, but it is outside `app/`.
    assert.strictEqual(yield* refusal(["README.md"]), "outside-workspace");
    assert.strictEqual(yield* refusal(["app/.git/config"]), "git-metadata");
    assert.strictEqual(yield* refusal(["app/keep.txt"]), "not-changed");
    assert.strictEqual(yield* refusal(["app/modified.txt", "app/keep.txt"]), "not-changed");
    runs.push({ id: RunId.make("run:revert-files:2"), ordinal: 2, status: "running" });
    assert.strictEqual(yield* refusal(["app/modified.txt"]), "turn-running");
    runs.pop();
    assert.deepStrictEqual(
      [yield* read("README.md"), yield* read("app/modified.txt"), yield* read("app/sub/new.txt")],
      ["turn\n", "turn\n", "turn\n"],
    );

    assert.deepStrictEqual(yield* revert(["app/modified.txt", "app/sub/new.txt"]), {
      restored: ["app/modified.txt"],
      deleted: ["app/sub/new.txt"],
    });
    assert.strictEqual(yield* read("app/modified.txt"), "before\n");
    assert.strictEqual(yield* read("README.md"), "turn\n");
  }).pipe(Effect.scoped, Effect.provide(layerTest)),
);

it.effect.skipIf(!symlinksSupported)(
  "refuses a file reached through a symbolic link out of the thread's folder",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { cwd, refusal } = yield* makeRevertFixture();
      const outside = yield* fs.makeTempDirectoryScoped({ prefix: "dacre-revert-outside-" });
      yield* fs.writeFileString(path.join(outside, "new.txt"), "outside\n");
      yield* fs.remove(path.join(cwd, "sub"), { recursive: true });
      yield* fs.symlink(outside, path.join(cwd, "sub"));

      assert.strictEqual(yield* refusal(["app/sub/new.txt"]), "symlink");
      assert.strictEqual(yield* fs.readFileString(path.join(outside, "new.txt")), "outside\n");
      assert.strictEqual(yield* fs.readLink(path.join(cwd, "sub")), outside);
    }).pipe(Effect.scoped, Effect.provide(layerTest)),
);

it.effect("answers a turn in a folder that is not a repository with an empty patch", () => {
  const projection = makeProjection();
  const layer = layerFor({
    projection: Effect.succeed({
      ...projection,
      checkpoints: projection.checkpoints.map((checkpoint) => ({
        ...checkpoint,
        status: "missing" as const,
      })),
    }),
  });
  return Effect.gen(function* () {
    const query = yield* CheckpointDiffQuery.CheckpointDiffQuery;
    const result = yield* query.getFullThreadDiff({ threadId, toTurnCount: 2 });
    assert.strictEqual(result.diff, "");
    assert.isUndefined(result.repositories);
  }).pipe(Effect.provide(layer));
});
