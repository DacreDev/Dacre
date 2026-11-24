import { assert, it } from "@effect/vitest";
import {
  CommandId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@dacre/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";
import type * as ProviderAdapter from "@dacre/provider-core/server/ProviderAdapter";

const instanceId = ProviderInstanceId.make("codex");
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("No provider process needed for metadata commands"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = Layer.mergeAll(
  layerDatabase,
  ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
  ProviderReplayHarness.layerWithRegistry(
    { name: "agent-mode" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: layerDatabase, runEffectWorker: false },
  ),
);

const createThread = (threadId: ThreadId, agentMode?: string) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    yield* orchestrator.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`create:${threadId}`),
      threadId,
      projectId: ProjectId.make("project:agent-mode"),
      title: "Modes",
      modelSelection: { instanceId, model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      ...(agentMode === undefined ? {} : { agentMode }),
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "web",
    });
  });

const shell = (threadId: ThreadId) =>
  Effect.flatMap(ProjectionStore.ProjectionStoreV2, (projections) =>
    projections.getThreadShell(threadId),
  );

it.layer(layerTest)("thread agent mode", (it) => {
  it.effect("leaves a thread with no mode exactly as it was", () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread:agent-mode-none");
      yield* createThread(threadId);
      const created = yield* shell(threadId);
      assert.notProperty(created, "agentMode");
      assert.equal(created?.interactionMode, "default");
    }),
  );

  it.effect("stores a read-only mode as Plan from creation", () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread:agent-mode-create");
      yield* createThread(threadId, "review");
      const created = yield* shell(threadId);
      assert.equal(created?.agentMode, "review");
      assert.equal(created?.interactionMode, "plan");
    }),
  );

  it.effect("persists a mode change and moves the stored interaction mode with it", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const threadId = ThreadId.make("thread:agent-mode-change");
      yield* createThread(threadId);
      const setMode = (agentMode: string, id: string) =>
        orchestrator.dispatch({
          type: "thread.metadata.update",
          commandId: CommandId.make(`mode:${id}`),
          threadId,
          agentMode,
        });

      yield* setMode("ask", "ask");
      assert.equal((yield* shell(threadId))?.agentMode, "ask");
      assert.equal((yield* shell(threadId))?.interactionMode, "plan");

      yield* setMode("debug", "debug");
      assert.equal((yield* shell(threadId))?.agentMode, "debug");
      assert.equal((yield* shell(threadId))?.interactionMode, "default");

      yield* setMode("custom:deleted", "deleted");
      assert.equal((yield* shell(threadId))?.agentMode, "agent");
      assert.equal((yield* shell(threadId))?.interactionMode, "default");
    }),
  );

  it.effect("keeps a read-only thread in Plan when a client resends the default", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const threadId = ThreadId.make("thread:agent-mode-mobile");
      yield* createThread(threadId, "architect");
      // Every mobile send writes the default interaction mode back onto the thread.
      yield* orchestrator.dispatch({
        type: "thread.interaction-mode.set",
        commandId: CommandId.make("mobile-send"),
        threadId,
        interactionMode: "default",
      });
      const after = yield* shell(threadId);
      assert.equal(after?.agentMode, "architect");
      assert.equal(after?.interactionMode, "plan");

      const writingThreadId = ThreadId.make("thread:agent-mode-mobile-writing");
      yield* createThread(writingThreadId, "debug");
      yield* orchestrator.dispatch({
        type: "thread.interaction-mode.set",
        commandId: CommandId.make("mobile-send-writing"),
        threadId: writingThreadId,
        interactionMode: "plan",
      });
      assert.equal((yield* shell(writingThreadId))?.interactionMode, "plan");
    }),
  );
});
