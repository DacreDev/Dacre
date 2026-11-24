import { McpServerConfig, type ProjectId } from "@dacre/contracts";
import { msg } from "gt-react";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

import { m } from "../../i18n/messages";

/** One variable or header row. `saved` is what the server sent: empty, or a marker for a stored value. */
export interface McpServerEntryDraft {
  readonly key: string;
  readonly name: string;
  /** The name the stored value belongs to; a renamed row needs a new value. */
  readonly savedName?: string;
  readonly saved: string;
  /** A replacement for the stored value; empty keeps it. */
  readonly value: string;
}

export interface McpServerDraft {
  readonly name: string;
  readonly enabled: boolean;
  readonly transport: "stdio" | "http";
  readonly command: string;
  /** One argument per line, so an argument may hold spaces and nothing is split like a shell would. */
  readonly args: string;
  readonly cwd: string;
  readonly url: string;
  readonly env: ReadonlyArray<McpServerEntryDraft>;
  readonly headers: ReadonlyArray<McpServerEntryDraft>;
  readonly projectId: ProjectId | null;
}

let nextEntryKey = 0;
export const newEntryKey = () => `entry-${nextEntryKey++}`;

export const emptyMcpServerDraft = (): McpServerDraft => ({
  name: "",
  enabled: true,
  transport: "stdio",
  command: "",
  args: "",
  cwd: "",
  url: "",
  env: [],
  headers: [],
  projectId: null,
});

const entryDrafts = (entries: ReadonlyArray<{ readonly name: string; readonly value: string }>) =>
  entries.map((entry) => ({
    key: newEntryKey(),
    name: entry.name,
    savedName: entry.name,
    saved: entry.value,
    value: "",
  }));

export function draftFromConfig(config: McpServerConfig): McpServerDraft {
  const { transport } = config;
  return {
    ...emptyMcpServerDraft(),
    name: config.name,
    enabled: config.enabled,
    transport: transport.type,
    projectId: config.scope.kind === "project" ? config.scope.projectId : null,
    ...(transport.type === "stdio"
      ? {
          command: transport.command,
          args: transport.args.join("\n"),
          cwd: transport.cwd ?? "",
          env: entryDrafts(transport.env),
        }
      : { url: transport.url, headers: entryDrafts(transport.headers) }),
  };
}

const entryValue = (entry: McpServerEntryDraft) =>
  entry.value !== "" ? entry.value : entry.name.trim() === entry.savedName ? entry.saved : "";

const formatter = SchemaIssue.makeFormatterStandardSchemaV1();
const decodeConfig = Schema.decodeUnknownResult(McpServerConfig);

/** The config to save, or the first reason it is not valid, checked by the settings schema itself. */
function validate(
  candidate: unknown,
): { readonly config: McpServerConfig } | { readonly error: string } {
  const result = decodeConfig(candidate);
  if (Result.isSuccess(result)) return { config: result.success };
  return {
    error:
      formatter(result.failure.issue).issues[0]?.message ?? m(msg("This server is not valid.")),
  };
}

export function configFromDraft(draft: McpServerDraft) {
  const entries = (list: ReadonlyArray<McpServerEntryDraft>) =>
    list.map((entry) => ({ name: entry.name.trim(), value: entryValue(entry) }));
  return validate({
    name: draft.name.trim(),
    enabled: draft.enabled,
    transport:
      draft.transport === "stdio"
        ? {
            type: "stdio",
            command: draft.command.trim(),
            args: draft.args.split(/\r?\n/).filter((argument) => argument.trim() !== ""),
            ...(draft.cwd.trim() === "" ? {} : { cwd: draft.cwd.trim() }),
            env: entries(draft.env),
          }
        : { type: "http", url: draft.url.trim(), headers: entries(draft.headers) },
    scope:
      draft.projectId === null ? { kind: "all" } : { kind: "project", projectId: draft.projectId },
  });
}

// Token shapes and credential query or flag names; such text in arguments or a URL stays plain.
const SECRET_LOOKING =
  /\b(?:sk-[\w-]{8,}|gh[opsu]_\w{20,}|github_pat_\w{20,}|xox[abpr]-[\w-]{10,}|glpat-[\w-]{10,}|AKIA[0-9A-Z]{16})|(?:[?&]|--)(?:api[_-]?key|access[_-]?token|token|secret|password)=\S+/i;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringEntries = (value: unknown) =>
  isRecord(value)
    ? Object.entries(value).flatMap(([name, entry]) =>
        typeof entry === "string" ? [{ name, value: entry }] : [],
      )
    : [];

export interface McpServersImport {
  readonly servers: ReadonlyArray<McpServerConfig>;
  readonly skipped: ReadonlyArray<{ readonly name: string; readonly reason: string }>;
  /** Servers whose arguments or URL look like they hold a secret, which settings keep as text. */
  readonly plainSecrets: ReadonlyArray<string>;
}

/**
 * Reads the `{ "mcpServers": { ... } }` object Claude Desktop, Claude Code and Cursor use. Every
 * variable and header value is kept, to be saved as a secret.
 */
export function parseMcpServersImport(
  text: string,
  existing: ReadonlyArray<{ readonly name: string }>,
): McpServersImport | { readonly error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: m(msg("This is not valid JSON.")) };
  }
  const entries = isRecord(parsed) ? parsed.mcpServers : undefined;
  if (!isRecord(entries)) return { error: m(msg("Paste an object with an mcpServers key.")) };

  const taken = new Set(existing.map((server) => server.name.toLowerCase()));
  const servers: Array<McpServerConfig> = [];
  const skipped: Array<{ readonly name: string; readonly reason: string }> = [];
  const plainSecrets: Array<string> = [];
  for (const [name, entry] of Object.entries(entries)) {
    if (!isRecord(entry)) {
      skipped.push({ name, reason: m(msg("Its settings are not an object.")) });
      continue;
    }
    if (entry.type === "sse") {
      skipped.push({
        name,
        reason: m(msg("It uses the older SSE transport, which Dacre does not offer.")),
      });
      continue;
    }
    if (taken.has(name.toLowerCase())) {
      skipped.push({ name, reason: m(msg("A server with this name already exists.")) });
      continue;
    }
    const args = Array.isArray(entry.args)
      ? entry.args.filter((argument) => typeof argument === "string")
      : [];
    const result = validate({
      name,
      enabled: entry.disabled !== true,
      transport:
        typeof entry.url === "string"
          ? { type: "http", url: entry.url, headers: stringEntries(entry.headers) }
          : {
              type: "stdio",
              command: entry.command,
              args,
              ...(typeof entry.cwd === "string" ? { cwd: entry.cwd } : {}),
              env: stringEntries(entry.env),
            },
      scope: { kind: "all" },
    });
    if ("error" in result) {
      skipped.push({ name, reason: result.error });
      continue;
    }
    taken.add(name.toLowerCase());
    servers.push(result.config);
    if (
      [...args, typeof entry.url === "string" ? entry.url : ""].some((value) =>
        SECRET_LOOKING.test(value),
      )
    ) {
      plainSecrets.push(name);
    }
  }
  return { servers, skipped, plainSecrets };
}
