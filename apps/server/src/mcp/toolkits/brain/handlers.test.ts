import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { assert, expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  type OrchestrationV2ThreadShell,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@dacre/contracts";
import * as NodeSqliteClient from "@dacre/shared/nodeSqliteClient";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { McpSchema, Tool } from "effect/ai";

import * as Brain from "../../../brain/Brain.ts";
import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import migration from "../../../persistence/Migrations/111_BrainEntries.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { liveThreadShell } from "../../McpToolAccess.testkit.ts";
import * as BrainHandlers from "./handlers.ts";
import { BrainToolkit } from "./tools.ts";

const threadId = ThreadId.make("thread:brain");
const projectId = liveThreadShell(threadId).projectId;

const threadScope = {
  environmentId: EnvironmentId.make("environment:brain"),
  requestNamespace: "provider:brain",
  thread: {
    threadId,
    providerSessionId: "provider:brain",
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  client: undefined,
  capabilities: new Set(["orchestration" as const]),
  issuedAt: 0,
};

const layerBrain = Brain.layer.pipe(
  Layer.provideMerge(
    Layer.effectDiscard(migration).pipe(
      Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })),
    ),
  ),
  Layer.provideMerge(NodeCrypto.layer),
);

const withTools = (
  scope: McpInvocationContext.McpInvocationScope,
  shell: OrchestrationV2ThreadShell = liveThreadShell(threadId),
) =>
  McpToolAccess.HandlersLayer.layer(BrainHandlers.layer).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        layerBrain,
        Layer.succeed(McpInvocationContext.McpInvocationContext, scope),
        Layer.mock(ThreadManagement.ThreadManagementService)({
          getThreadShell: () => Effect.succeed(shell),
        }),
      ),
    ),
  );

const lastResult = <E, R>(
  handled: Effect.Effect<Stream.Stream<{ readonly result: unknown }, E, R>, E, R>,
) =>
  handled.pipe(
    Stream.unwrap,
    Stream.runCollect,
    Effect.map((parts) => parts.at(-1)?.result),
  );

const search = (params: { readonly query?: string }) =>
  Effect.flatMap(BrainToolkit, (toolkit) => lastResult(toolkit.handle("brain_search", params)));

const save = (params: {
  readonly kind: "decision";
  readonly title: string;
  readonly body: string;
  readonly scope: "project" | "global";
}) =>
  Effect.flatMap(BrainToolkit, (toolkit) => lastResult(toolkit.handle("brain_remember", params)));

const remember = {
  kind: "decision",
  title: "Ship on Fridays",
  body: "Agreed in planning.",
  scope: "project",
} as const;

it.effect("reads enabled entries for the thread's project and global ones", () =>
  Effect.gen(function* () {
    const brain = yield* Brain.Brain;
    const save = (title: string, id: ProjectId | null) =>
      brain.save({ projectId: id, kind: "note", title, body: `${title} body` });
    yield* save("mine", projectId);
    yield* save("everywhere", null);
    yield* save("theirs", ProjectId.make("project:other"));
    const off = yield* save("switched off", projectId);
    yield* brain.setEnabled({ id: off.id, enabled: false });

    const result = (yield* search({})) as {
      readonly entries: ReadonlyArray<{ readonly title: string; readonly scope: string }>;
      readonly omitted: number;
    };
    expect(result.entries.map((entry) => [entry.title, entry.scope]).sort()).toEqual([
      ["everywhere", "global"],
      ["mine", "project"],
    ]);
    expect(result.omitted).toBe(0);
  }).pipe(Effect.provide(withTools(threadScope))),
);

it.effect("saves an agent's note in the scope it names, always unpinned", () =>
  Effect.gen(function* () {
    const brain = yield* Brain.Brain;
    yield* save(remember);
    yield* save({ ...remember, title: "Everywhere", scope: "global" });

    const { entries } = yield* brain.list({});
    expect(entries.map((entry) => [entry.title, entry.projectId, entry.source]).sort()).toEqual(
      [
        ["Everywhere", null, "agent"],
        ["Ship on Fridays", projectId, "agent"],
      ].sort(),
    );
    assert.isTrue(entries.every((entry) => !entry.pinned));
  }).pipe(Effect.provide(withTools(threadScope))),
);

it.effect("reports a credential as an invalid request, with nothing saved", () =>
  Effect.gen(function* () {
    const brain = yield* Brain.Brain;
    const result = yield* save({ ...remember, body: "password=hunter2" });
    expect(result).toMatchObject({ code: "invalid_request" });
    expect((result as { readonly message: string }).message).not.toContain("hunter2");
    assert.lengthOf((yield* brain.list({})).entries, 0);
  }).pipe(Effect.provide(withTools(threadScope))),
);

it.effect("refuses a caller outside a thread", () =>
  Effect.gen(function* () {
    const client = { sessionId: "client", label: "Client", access: "full-access" as const };
    const outside = withTools({ ...threadScope, thread: undefined, client });
    for (const attempt of [search({}), save(remember)]) {
      const result = yield* attempt.pipe(Effect.provide(outside));
      expect(result).toMatchObject({ code: "thread_credential_required" });
    }
  }),
);

it.effect("keeps work a limited link started from writing", () =>
  Effect.gen(function* () {
    const linked = {
      ...liveThreadShell(threadId),
      linkOrigin: { sessionId: "link", label: "Laptop", access: "auto-accept-edits" as const },
    };
    const result = yield* save(remember).pipe(Effect.provide(withTools(threadScope, linked)));
    expect(result).toMatchObject({ code: "capability_denied" });
    expect((result as { readonly message: string }).message).toContain("Brain");
    expect((result as { readonly message: string }).message).not.toContain("scheduled");
  }),
);

it("offers both tools only inside threads, and only the search as read-only", () => {
  const { brain_search: searchTool, brain_remember: rememberTool } = BrainToolkit.tools;
  for (const tool of [searchTool, rememberTool]) {
    expect(Context.getOrUndefined(tool.annotations, McpSchema.EnabledWhen)).toBe(
      McpInvocationContext.hiddenFromOutsideClients,
    );
  }
  assert.isTrue(Context.get(searchTool.annotations, Tool.Readonly));
  assert.isFalse(Context.get(rememberTool.annotations, Tool.Readonly));
});
