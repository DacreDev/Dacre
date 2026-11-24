import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "effect/cli";

// shortcut: Dacre's playbook cloned Dacre's repo and filed issues there. Write Dacre's own before enabling this.
class TriageUnavailableError extends Schema.TaggedError<TriageUnavailableError>()(
  "TriageUnavailableError",
  {},
) {
  override get message(): string {
    return "Triage is not available in Dacre yet.";
  }
}

export const triageCommand = Command.make("triage").pipe(
  Command.withDescription("Not available in Dacre yet."),
  Command.withHandler(
    Effect.fn("cli.triage")(function* () {
      return yield* new TriageUnavailableError();
    }),
  ),
);
