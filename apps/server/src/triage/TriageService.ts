import {
  ServerPrepareTriageError,
  type ServerPrepareTriageInput,
  type ServerPrepareTriageResult,
} from "@dacre/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class TriageService extends Context.Service<
  TriageService,
  {
    readonly prepare: (
      input: ServerPrepareTriageInput,
    ) => Effect.Effect<ServerPrepareTriageResult, ServerPrepareTriageError>;
  }
>()("dacre/triage/TriageService") {}

// shortcut: Dacre's playbook cloned Dacre's repo and filed issues there. Write Dacre's own before enabling this.
export const layer = Layer.succeed(
  TriageService,
  TriageService.of({
    prepare: Effect.fn("TriageService.prepare")(function* () {
      return yield* new ServerPrepareTriageError({
        cause: "Triage is not available in Dacre yet.",
      });
    }),
  }),
);
