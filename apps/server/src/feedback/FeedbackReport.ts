import { AgentFeedbackKind, AgentFeedbackTrace } from "@dacre/contracts";
import { resolveDacreMcpToolId } from "@dacre/shared/dacreMcpToolPresentation";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";

// Code points, as the scrubber caps them, so a valid input stays a valid report after redaction.
const FeedbackText = Schema.String.check(Schema.isMaxCodePoints(300));

/** Turns the outline of a requested report covers at least. */
export const FEEDBACK_TRACE_TURNS = 5;

const reportFields = {
  kind: AgentFeedbackKind,
  subject: Schema.String.annotate({
    description: "Dacre tool name, `dacre` command, or `general`.",
  }),
  expected: FeedbackText,
  actual: FeedbackText,
  workaround: FeedbackText.annotate({ description: "What you did instead, or empty." }),
  // Annotate before the default: an annotation after it never reaches the JSON schema.
  userRequested: Schema.Boolean.annotate({ description: "The user asked for this report." }).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(false)),
  ),
};

export const FeedbackInput = Schema.Struct({
  ...reportFields,
  turns: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
    .annotate({
      description: "How many recent turns, counting this one, the problem spans.",
    })
    .pipe(Schema.withDecodingDefaultKey(Effect.succeed(1))),
});

export const FeedbackTrace = AgentFeedbackTrace;
export type FeedbackTrace = AgentFeedbackTrace;

const storedFields = {
  id: Schema.String,
  threadId: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  source: Schema.Literals(["mcp", "cli"]),
  sent: Schema.Boolean,
};

export const FeedbackReport = Schema.Struct({
  ...reportFields,
  ...storedFields,
  trace: Schema.NullOr(FeedbackTrace),
});

/** What `dacre_feedback` answers: the report, with only the size of what its trace attached. */
export const FeedbackSubmitResult = Schema.Struct({
  ...reportFields,
  ...storedFields,
  trace: Schema.NullOr(FeedbackTrace.mapFields(Struct.omit(["entries"]))),
});

export const FEEDBACK_AWAITING_APPROVAL_NOTE =
  "The user sees this report in a card and chooses there whether to send it and whether to include the conversation. Nothing is sent until they do, and you will not learn their choice. Do not wait for it or send it another way. Call again only if the user asks to change it; that shows a new card.";

/** What `dacre_feedback` answers for a requested report: shown to the user, not yet sent. */
export const FeedbackAwaitingApproval = Schema.Struct({
  status: Schema.Literal("awaiting_approval"),
  note: Schema.String,
});
export type FeedbackAwaitingApproval = typeof FeedbackAwaitingApproval.Type;

export const FEEDBACK_OFF_MESSAGE =
  "Agent feedback is off. Turn it on in Dacre under Settings > Labs, then try again.";

export class FeedbackOffError extends Schema.TaggedError<FeedbackOffError>()(
  "FeedbackOffError",
  {},
) {
  override get message() {
    return FEEDBACK_OFF_MESSAGE;
  }
}

export type FeedbackSource = "mcp" | "cli";

// Requested reports count when their card is shown, unprompted ones when stored.
export const MAX_REPORTS_PER_TURN = 3;
// Reports from no turn, such as `dacre feedback`, have no turn to count in.
export const MAX_REPORTS_OUTSIDE_TURNS_PER_HOUR = 10;

export class FeedbackLimitError extends Schema.TaggedError<FeedbackLimitError>()(
  "FeedbackLimitError",
  { scope: Schema.Literals(["turn", "hour", "cards"]) },
) {
  override get message() {
    switch (this.scope) {
      case "turn":
        return `This turn already sent ${MAX_REPORTS_PER_TURN} agent feedback reports; nothing was sent.`;
      case "cards":
        return `This turn already showed the user ${MAX_REPORTS_PER_TURN} agent feedback reports to approve; nothing was shown.`;
      case "hour":
        return `This machine already sent ${MAX_REPORTS_OUTSIDE_TURNS_PER_HOUR} agent feedback reports outside a turn in the last hour; nothing was sent.`;
    }
  }
}

export class FeedbackNotRequestedError extends Schema.TaggedError<FeedbackNotRequestedError>()(
  "FeedbackNotRequestedError",
  { source: Schema.Literals(["mcp", "cli"]) },
) {
  override get message() {
    return this.source === "cli"
      ? "Agent feedback is set to When I ask: ask your agent in a thread to send it, so you can approve what is sent."
      : "Agent feedback is set to When I ask: send a report only when the user asks for one.";
  }
}

export class FeedbackStorageError extends Schema.TaggedError<FeedbackStorageError>()(
  "FeedbackStorageError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "Could not save agent feedback.";
  }
}

/** The MCP client label `dacre feedback` signs in with, so its reports count as `cli`. */
export const FEEDBACK_CLI_CLIENT_LABEL = "dacre feedback cli";

/** Listed `dacre` command paths a report may name. A CLI test keeps this in step with binCli. */
export const DA_CLI_COMMANDS: ReadonlyArray<string> = [
  "dacre",
  "dacre help",
  "dacre serve",
  "dacre app",
  "dacre pair",
  "dacre auth",
  "dacre auth connect-device",
  "dacre auth connect-device approve",
  "dacre auth connect-device list",
  "dacre auth connect-device revoke",
  "dacre auth pairing",
  "dacre auth pairing create",
  "dacre auth pairing list",
  "dacre auth pairing revoke",
  "dacre auth session",
  "dacre auth session issue",
  "dacre auth session list",
  "dacre auth session revoke",
  "dacre environment",
  "dacre environment link",
  "dacre environment list",
  "dacre environment unlink",
  "dacre browser",
  "dacre browser setup",
  "dacre project",
  "dacre project add",
  "dacre project remove",
  "dacre project rename",
  "dacre thread",
  "dacre thread list",
  "dacre thread start",
  "dacre thread send",
  "dacre thread show",
  "dacre feedback",
  "dacre feedback list",
  "dacre workflow",
  "dacre workflow start",
  "dacre workflow list",
  "dacre workflow show",
  "dacre workflow resume",
  "dacre workflow cancel",
  "dacre workflow signal",
  "dacre workflow questions",
  "dacre workflow hooks",
  "dacre workflow store",
  "dacre workflow store list",
  "dacre workflow store set",
  "dacre workflow store delete",
  "dacre up",
  "dacre status",
  "dacre service",
  "dacre service install",
  "dacre service restart",
  "dacre service uninstall",
  "dacre service status",
  "dacre service protect",
  "dacre update",
  "dacre install",
  "dacre uninstall",
  "dacre theme",
  "dacre theme set",
  "dacre theme clear",
  "dacre theme show",
  "dacre trace",
  "dacre trace summary",
  "dacre doctor",
  "dacre policy",
  "dacre policy show",
  "dacre policy check",
  "dacre policy templates",
  "dacre policy settings",
  "dacre triage",
  "dacre connect",
  "dacre connect link",
  "dacre connect login",
  "dacre connect logout",
  "dacre connect status",
  "dacre connect unlink",
];

export type FeedbackInput = typeof FeedbackInput.Type;
export type FeedbackReport = typeof FeedbackReport.Type;

export const FEEDBACK_SUBJECT_MESSAGE =
  "Set subject to the exact Dacre tool name, the dacre command, or `general`.";

// The shared resolver knows the presented tools; the prefix covers the rest, such as these.
// Codex also registers `dacre-direct` for Dacre tools it keeps out of Code Mode.
const DA_PREFIX = /^(?:mcp__dacre(?:[-_]direct)?__|dacre(?:[-_]direct)?[.:/])/iu;

/** The bare name of a registered Dacre tool however a provider prefixed it, else undefined. */
export const resolveDacreToolName = (name: string, toolNames: ReadonlyArray<string>) => {
  const tool = resolveDacreMcpToolId(name) ?? name.replace(DA_PREFIX, "");
  if (toolNames.includes(tool)) return tool;
  // OpenCode 2 prefixes tools with `dacre-<thread>_`, underscores and all: the longest name wins.
  if (!/^dacre-/iu.test(name)) return undefined;
  return toolNames
    .filter((candidate) => name.endsWith(`_${candidate}`))
    .toSorted((a, b) => b.length - a.length)[0];
};

/** The stored subject, or undefined when the value names no Dacre tool, `dacre` command, or `general`. */
export const resolveFeedbackSubject = (value: string, toolNames: ReadonlyArray<string>) => {
  const subject = value.trim();
  if (subject === "general" || DA_CLI_COMMANDS.includes(subject)) return subject;
  return resolveDacreToolName(subject, toolNames);
};
