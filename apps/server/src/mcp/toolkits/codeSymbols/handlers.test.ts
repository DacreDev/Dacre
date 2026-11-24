import { assert, expect, it } from "@effect/vitest";
import {
  type CodeSymbolIndexStatus,
  type CodeSymbolSearchInput,
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
} from "@dacre/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { McpSchema, Tool } from "effect/ai";

import * as CodeSymbols from "../../../codeSymbols/CodeSymbols.ts";
import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { liveThreadShell } from "../../McpToolAccess.testkit.ts";
import * as CodeSymbolsHandlers from "./handlers.ts";
import { CodeSymbolsToolkit } from "./tools.ts";

const threadId = ThreadId.make("thread:symbols");

const threadScope = {
  environmentId: EnvironmentId.make("environment:symbols"),
  requestNamespace: "provider:symbols",
  thread: {
    threadId,
    providerSessionId: "provider:symbols",
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  client: undefined,
  capabilities: new Set(["orchestration" as const]),
  issuedAt: 0,
};

const ready: CodeSymbolIndexStatus = {
  state: "ready",
  filesDone: 0,
  filesTotal: 0,
  indexedFiles: 12,
  lastError: null,
};

/** The tools over a stand-in index that records each search it is asked for. */
const withTools = (
  scope: McpInvocationContext.McpInvocationScope,
  searches: Array<CodeSymbolSearchInput>,
  status: CodeSymbolIndexStatus = ready,
) =>
  McpToolAccess.HandlersLayer.layer(CodeSymbolsHandlers.layer).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.succeed(McpInvocationContext.McpInvocationContext, scope),
        Layer.mock(ThreadManagement.ThreadManagementService)({
          getThreadShell: () => Effect.succeed(liveThreadShell(threadId)),
        }),
        Layer.mock(CodeSymbols.CodeSymbols)({
          search: (input) =>
            Effect.sync(() => {
              searches.push(input);
              return {
                symbols: [
                  {
                    name: "WorkspaceIndex",
                    kind: "class" as const,
                    path: "src/index.ts",
                    line: 4,
                    column: 14,
                    container: null,
                  },
                ],
                status,
              };
            }),
        }),
      ),
    ),
  );

const symbols = (params: { readonly query: string; readonly kind?: "class" }) =>
  Effect.flatMap(CodeSymbolsToolkit, (toolkit) =>
    toolkit.handle("code_symbols", params).pipe(
      Stream.unwrap,
      Stream.runCollect,
      Effect.map((parts) => parts.at(-1)?.result),
    ),
  );

it.effect("searches the calling thread's project", () => {
  const searches: Array<CodeSymbolSearchInput> = [];
  return Effect.gen(function* () {
    const result = yield* symbols({ query: "Index", kind: "class" });
    expect(searches).toEqual([
      { projectId: liveThreadShell(threadId).projectId, query: "Index", kind: "class", limit: 20 },
    ]);
    expect(result).toEqual({
      symbols: [
        { name: "WorkspaceIndex", kind: "class", path: "src/index.ts", line: 4, container: null },
      ],
      indexing: false,
    });
  }).pipe(Effect.provide(withTools(threadScope, searches)));
});

it.effect("says when the project's first index is still building", () =>
  Effect.gen(function* () {
    const result = yield* symbols({ query: "Index" });
    expect(result).toMatchObject({ indexing: true });
  }).pipe(
    Effect.provide(
      withTools(threadScope, [], { ...ready, state: "indexing", filesTotal: 40, indexedFiles: 0 }),
    ),
  ),
);

it.effect("refuses a caller outside a thread", () => {
  const searches: Array<CodeSymbolSearchInput> = [];
  const client = { sessionId: "client", label: "Client", access: "full-access" as const };
  return Effect.gen(function* () {
    const result = yield* symbols({ query: "Index" });
    expect(result).toMatchObject({ code: "thread_credential_required" });
    assert.lengthOf(searches, 0);
  }).pipe(Effect.provide(withTools({ ...threadScope, thread: undefined, client }, searches)));
});

it("is read-only and offered only inside threads", () => {
  const tool = CodeSymbolsToolkit.tools.code_symbols;
  expect(Context.getOrUndefined(tool.annotations, McpSchema.EnabledWhen)).toBe(
    McpInvocationContext.hiddenFromOutsideClients,
  );
  assert.isTrue(Context.get(tool.annotations, Tool.Readonly));
});
