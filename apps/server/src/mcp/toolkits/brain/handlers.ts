import { OrchestratorMcpFailure } from "@dacre/contracts";
import * as Effect from "effect/Effect";

import * as Brain from "../../../brain/Brain.ts";
import { assertNotLinked } from "../../linkOrigin.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { loadCaller, unavailable } from "../../threadAccess.ts";
import { BrainToolkit } from "./tools.ts";

const invalidRequest = (error: { readonly message: string }) =>
  Effect.fail(new OrchestratorMcpFailure({ code: "invalid_request", message: error.message }));

/** The thread both tools act for; `*AsCaller` has already required that there is one. */
const callerThread = loadCaller().pipe(
  Effect.flatMap((context) =>
    context.caller === undefined
      ? Effect.fail(unavailable())
      : Effect.succeed({ context, thread: context.caller }),
  ),
);

export const layer = McpToolAccess.toLayer(BrainToolkit, {
  brain_search: McpToolAccess.readsAsCaller(({ query, kind, limit }) =>
    Effect.gen(function* () {
      const brain = yield* Brain.Brain;
      const { thread } = yield* callerThread;
      const { entries, omitted } = yield* brain
        .search({ projectId: thread.projectId, query, kind, limit })
        .pipe(Effect.mapError(unavailable));
      return {
        entries: entries.map(({ id, kind, projectId, source, title, body, updatedAt }) => ({
          id,
          kind,
          scope: projectId === null ? ("global" as const) : ("project" as const),
          source,
          title,
          body,
          updatedAt,
        })),
        omitted,
      };
    }),
  ),
  brain_remember: McpToolAccess.actsAsCaller(({ kind, title, body, scope }) =>
    Effect.gen(function* () {
      const brain = yield* Brain.Brain;
      const { context, thread } = yield* callerThread;
      yield* assertNotLinked(context, "add to this environment's Brain");
      const entry = yield* brain
        .remember({
          projectId: scope === "global" ? null : thread.projectId,
          kind,
          title,
          body,
        })
        .pipe(
          Effect.catchTags({
            BrainCredentialError: invalidRequest,
            BrainLimitError: invalidRequest,
            BrainStorageError: () => Effect.fail(unavailable()),
          }),
        );
      return { id: entry.id, scope };
    }),
  ),
});
