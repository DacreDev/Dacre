import type {
  McpServerConfigs,
  McpServerId,
  McpServerTestResult,
  McpServerTransport,
} from "@dacre/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as ServerSettings from "../serverSettings.ts";

/** An SDK call that failed; `failureDetail` reads the reason from its cause. */
class McpServerCallError extends Schema.TaggedError<McpServerCallError>()("McpServerCallError", {
  cause: Schema.Defect(),
}) {}

export class McpServerTest extends Context.Service<
  McpServerTest,
  {
    /**
     * Connects to one saved server and lists its tools for the Settings "Test" button. It closes
     * the connection afterwards, which stops a process it started.
     */
    readonly test: (id: McpServerId) => Effect.Effect<McpServerTestResult>;
  }
>()("dacre/mcp/McpServerTest") {}

const MAX_TOOL_PAGES = 20;
const STDERR_TAIL_CHARS = 2_000;

const errorCode = (error: unknown): unknown =>
  typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;

/** A plain-language reason, with any configured value removed in case the server echoed it. */
function failureDetail(error: unknown, stderr: string): string {
  const code = errorCode(error);
  if (code === "ENOENT") {
    return "The command was not found. Use an absolute path or a program on the server's PATH.";
  }
  if (code === "EACCES") return "The command could not be run. Check that it is executable.";
  if (error instanceof StreamableHTTPError) {
    return error.code === 401 || error.code === 403
      ? `The server refused the connection (HTTP ${error.code}). Check its headers.`
      : `The server answered HTTP ${error.code}.`;
  }
  if (error instanceof TypeError && error.message === "fetch failed") {
    const reason =
      errorCode(error.cause) ?? (error.cause instanceof Error ? error.cause.message : undefined);
    return `Could not reach the server${typeof reason === "string" ? ` (${reason})` : ""}.`;
  }
  if (error instanceof McpError && error.code === ErrorCode.ConnectionClosed) {
    const lastLine = stderr.trim().split("\n").at(-1)?.trim();
    return lastLine
      ? `The server stopped before it answered: ${lastLine}`
      : "The server stopped before it answered.";
  }
  return error instanceof Error ? error.message : String(error);
}

const redact = (text: string, secrets: ReadonlyArray<string>) =>
  // shortcut: values under 4 characters are not plausible credentials and would mangle the text.
  secrets
    .filter((secret) => secret.length >= 4)
    .reduce((current, secret) => current.replaceAll(secret, "[redacted]"), text);

const listTools = Effect.fn("McpServerTest.listTools")(function* (transport: McpServerTransport) {
  let stderr = "";
  const values = (entries: ReadonlyArray<{ readonly name: string; readonly value: string }>) =>
    Object.fromEntries(entries.map((entry) => [entry.name, entry.value]));
  const { client, connection } = yield* Effect.acquireRelease(
    Effect.sync(() => {
      const connection =
        transport.type === "stdio"
          ? new StdioClientTransport({
              command: transport.command,
              args: [...transport.args],
              env: values(transport.env),
              ...(transport.cwd === undefined ? {} : { cwd: transport.cwd }),
              stderr: "pipe",
            })
          : new StreamableHTTPClientTransport(new URL(transport.url), {
              requestInit: { headers: values(transport.headers) },
            });
      if (connection instanceof StdioClientTransport) {
        connection.stderr?.on("data", (chunk: Buffer) => {
          stderr = (stderr + chunk.toString("utf8")).slice(-STDERR_TAIL_CHARS);
        });
      }
      return { client: new Client({ name: "dacre", version: "1.0.0" }), connection };
    }),
    // Closing ends the process: stdin first, then SIGTERM, then SIGKILL.
    ({ client }) => Effect.promise(() => client.close()),
  );
  return yield* Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: (signal) => client.connect(connection, { signal }),
      catch: (cause) => new McpServerCallError({ cause }),
    });
    const tools: Array<string> = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_TOOL_PAGES; page++) {
      const result = yield* Effect.tryPromise({
        try: (signal) => client.listTools(cursor === undefined ? {} : { cursor }, { signal }),
        catch: (cause) => new McpServerCallError({ cause }),
      });
      tools.push(...result.tools.map((tool) => tool.name));
      cursor = result.nextCursor;
      if (cursor === undefined) break;
    }
    return { _tag: "Connected", tools } as const;
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({ _tag: "Failed", detail: failureDetail(error.cause, stderr) } as const),
    ),
  );
}, Effect.scoped);

export const make = Effect.fn("McpServerTest.make")(function* (
  options: { readonly timeout?: Duration.Duration } = {},
) {
  const settings = yield* ServerSettings.ServerSettingsService;
  const timeout = options.timeout ?? Duration.seconds(15);
  const running = new Set<string>();

  const test = Effect.fn("McpServerTest.test")(function* (id: McpServerId) {
    const servers = yield* settings.getSettings.pipe(
      Effect.map((current) => current.mcpServers),
      Effect.orElseSucceed((): McpServerConfigs => ({})),
    );
    const server = Object.hasOwn(servers, id) ? servers[id] : undefined;
    if (server === undefined) {
      return { _tag: "Failed", detail: "This server is no longer configured." } as const;
    }
    if (running.has(id)) {
      return { _tag: "Failed", detail: "A test of this server is already running." } as const;
    }
    running.add(id);
    const secrets =
      server.transport.type === "stdio"
        ? server.transport.env.map((entry) => entry.value)
        : server.transport.headers.map((entry) => entry.value);
    const result: McpServerTestResult = yield* listTools(server.transport).pipe(
      // The timeout waits for the close above, so the process is gone when this returns.
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () =>
          Effect.succeed({
            _tag: "Failed",
            detail: `The server did not answer within ${Duration.toSeconds(timeout)} seconds.`,
          } as const),
      }),
      Effect.ensuring(Effect.sync(() => running.delete(id))),
    );
    return result._tag === "Failed"
      ? { ...result, detail: redact(result.detail, secrets) }
      : result;
  });

  return McpServerTest.of({ test });
});

export const layer = Layer.effect(McpServerTest, make());
