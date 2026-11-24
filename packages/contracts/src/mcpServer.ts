import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceEnvironmentVariableName } from "./providerInstance.ts";

const MAX_ENTRIES = 64;
const MAX_VALUE_LENGTH = 16_384;

export const McpServerId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(64),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/),
).pipe(Schema.brand("McpServerId"));
export type McpServerId = typeof McpServerId.Type;

/** Dacre's own server takes `dacre` and names that start with `dacre-` or `dacre_`. */
const isReservedMcpServerName = (name: string) => /^dacre(?:$|[-_])/i.test(name);

// Codex splits config keys on dots and Claude names tools mcp__<server>__<tool>, so names stay plain.
export const McpServerName = TrimmedNonEmptyString.check(
  Schema.isMaxLength(64),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/, {
    expected: "letters, digits, hyphens and underscores",
  }),
  Schema.makeFilter(
    (name: string) => !isReservedMcpServerName(name) || "This name is reserved for Dacre's server.",
  ),
);

const isAbsoluteMcpPath = (value: string) =>
  value.startsWith("/") || value.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(value);

const hasControlCharacter = (value: string) => /[\u0000-\u001f\u007f]/.test(value);

// Sessions pass the command and its arguments as argv, never through a shell.
export const McpServerCommand = TrimmedNonEmptyString.check(
  Schema.isMaxLength(1_024),
  Schema.makeFilter(
    (command: string) =>
      (!hasControlCharacter(command) &&
        (isAbsoluteMcpPath(command) || /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(command))) ||
      "Use a program on PATH, such as npx, or an absolute path, and put arguments in Arguments.",
  ),
);

const McpServerArgument = Schema.String.check(
  Schema.isMaxLength(4_096),
  Schema.makeFilter((value: string) => !value.includes("\u0000") || "Arguments cannot hold NUL."),
);

const McpServerWorkingDirectory = TrimmedNonEmptyString.check(
  Schema.isMaxLength(1_024),
  Schema.makeFilter(
    (value: string) =>
      (isAbsoluteMcpPath(value) && !hasControlCharacter(value)) || "Use an absolute folder path.",
  ),
);

const isHttpUrl = (value: string): true | string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a full URL, such as https://example.com/mcp.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Use an http or https URL.";
  if (url.username !== "" || url.password !== "") return "Put credentials in a header.";
  return true;
};

export const McpServerUrl = TrimmedNonEmptyString.check(
  Schema.isMaxLength(2_048),
  Schema.makeFilter(isHttpUrl),
);

/**
 * The value is a secret: settings.json and clients see only whether one is set. It is the
 * value itself only on its way in from a client and inside the server.
 */
export const McpServerVariable = Schema.Struct({
  name: ProviderInstanceEnvironmentVariableName,
  value: Schema.String.check(
    Schema.isMaxLength(MAX_VALUE_LENGTH),
    Schema.makeFilter((value: string) => !value.includes("\u0000") || "Values cannot hold NUL."),
  ),
});
export type McpServerVariable = typeof McpServerVariable.Type;

export const McpServerHeader = Schema.Struct({
  name: TrimmedNonEmptyString.check(
    Schema.isMaxLength(128),
    Schema.isPattern(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/, { expected: "an HTTP header name" }),
  ),
  value: Schema.String.check(
    Schema.isMaxLength(MAX_VALUE_LENGTH),
    Schema.makeFilter(
      (value: string) => !/[\r\n\u0000]/.test(value) || "Header values fit on one line.",
    ),
  ),
});
export type McpServerHeader = typeof McpServerHeader.Type;

const uniqueNames = (caseInsensitive: boolean) =>
  Schema.makeFilter((entries: ReadonlyArray<{ readonly name: string }>) => {
    const names = entries.map((entry) => (caseInsensitive ? entry.name.toLowerCase() : entry.name));
    return new Set(names).size === names.length || "Each name can appear once.";
  });

export const McpServerStdioTransport = Schema.Struct({
  type: Schema.Literal("stdio"),
  command: McpServerCommand,
  args: Schema.Array(McpServerArgument)
    .check(Schema.isMaxLength(MAX_ENTRIES))
    .pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
  cwd: Schema.optionalKey(McpServerWorkingDirectory),
  env: Schema.Array(McpServerVariable)
    .check(Schema.isMaxLength(MAX_ENTRIES), uniqueNames(false))
    .pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
});

export const McpServerHttpTransport = Schema.Struct({
  type: Schema.Literal("http"),
  url: McpServerUrl,
  headers: Schema.Array(McpServerHeader)
    .check(Schema.isMaxLength(MAX_ENTRIES), uniqueNames(true))
    .pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
});

export const McpServerTransport = Schema.Union([McpServerStdioTransport, McpServerHttpTransport]);
export type McpServerTransport = typeof McpServerTransport.Type;

export const McpServerScope = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("all") }),
  Schema.Struct({ kind: Schema.Literal("project"), projectId: ProjectId }),
]);
export type McpServerScope = typeof McpServerScope.Type;

/** A user's MCP server, given to every supporting provider's sessions in its scope. */
export const McpServerConfig = Schema.Struct({
  name: McpServerName,
  enabled: Schema.Boolean,
  transport: McpServerTransport,
  scope: McpServerScope,
});
export type McpServerConfig = typeof McpServerConfig.Type;

/** Two servers can meet in one session unless each serves a different single project. */
const shareSessions = (left: McpServerScope, right: McpServerScope) =>
  left.kind === "all" ||
  right.kind === "all" ||
  (left.kind === "project" && right.kind === "project" && left.projectId === right.projectId);

/** The id of another server that would reach a session under the same name, if any. */
export function conflictingMcpServerId(
  servers: Readonly<Record<string, Pick<McpServerConfig, "name" | "scope">>>,
  id: string,
  candidate: Pick<McpServerConfig, "name" | "scope">,
): string | undefined {
  const name = candidate.name.toLowerCase();
  return Object.entries(servers).find(
    ([otherId, other]) =>
      otherId !== id &&
      other.name.toLowerCase() === name &&
      shareSessions(other.scope, candidate.scope),
  )?.[0];
}

export const McpServerConfigs = Schema.Record(McpServerId, McpServerConfig).check(
  Schema.makeFilter((servers: Readonly<Record<string, McpServerConfig>>) => {
    for (const [id, server] of Object.entries(servers)) {
      if (conflictingMcpServerId(servers, id, server) !== undefined) {
        return `Another MCP server is named "${server.name}" for the same projects.`;
      }
    }
    return true;
  }),
);
export type McpServerConfigs = typeof McpServerConfigs.Type;

export const McpServerTestResult = Schema.Union([
  Schema.TaggedStruct("Connected", { tools: Schema.Array(Schema.String) }),
  Schema.TaggedStruct("Failed", { detail: Schema.String }),
]);
export type McpServerTestResult = typeof McpServerTestResult.Type;

/**
 * Which of the user's MCP servers a provider's sessions receive. A provider without it receives
 * none. Without `workingDirectory`, a stdio server that sets a working folder is left out.
 */
export const UserMcpServerSupport = Schema.Struct({
  stdio: Schema.Boolean,
  http: Schema.Boolean,
  workingDirectory: Schema.Boolean,
});
export type UserMcpServerSupport = typeof UserMcpServerSupport.Type;
