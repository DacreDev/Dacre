// @effect-diagnostics nodeBuiltinImport:off -- Fixtures report a pid through a file and hold a port.
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { McpServerId, type McpServerConfig } from "@dacre/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSettings from "../serverSettings.ts";
import * as McpServerTest from "./McpServerTest.ts";

// A newline-delimited JSON-RPC MCP server that offers one tool, named from its environment.
const FIXTURE_SERVER = `
const lines = require("readline").createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: {
      protocolVersion: message.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: "fixture", version: "1.0.0" },
    } });
  } else if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: {
      tools: [{ name: process.env.TOOL_NAME, inputSchema: { type: "object" } }],
    } });
  }
});`;

const SILENT_SERVER = `
require("fs").writeFileSync(process.env.PID_FILE, String(process.pid));
setInterval(() => {}, 1000);`;

const FAILING_SERVER = `
process.stderr.write("rejected key " + process.env.API_KEY + "\\n");
process.exit(1);`;

const stdio = (script: string, env: Record<string, string>): McpServerConfig => ({
  name: "fixture",
  enabled: true,
  transport: {
    type: "stdio",
    command: process.execPath,
    args: ["-e", script],
    env: Object.entries(env).map(([name, value]) => ({ name, value })),
  },
  scope: { kind: "all" },
});

const id = McpServerId.make("fixture");
const testWith = (server: McpServerConfig) =>
  Layer.effect(
    McpServerTest.McpServerTest,
    McpServerTest.make({ timeout: Duration.millis(500) }),
  ).pipe(
    Layer.provide(ServerSettings.ServerSettingsService.layerTest({ mcpServers: { [id]: server } })),
  );

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("McpServerTest", () => {
  it.live("lists the tools of a stdio server started with its variables", () =>
    Effect.gen(function* () {
      const tester = yield* McpServerTest.McpServerTest;
      assert.deepEqual(yield* tester.test(id), { _tag: "Connected", tools: ["search_issues"] });
    }).pipe(Effect.provide(testWith(stdio(FIXTURE_SERVER, { TOOL_NAME: "search_issues" })))),
  );

  it.live("stops a server that does not answer in time, and runs one test at a time", () => {
    const pidFile = NodePath.join(
      NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "dacre-mcp-test-")),
      "pid",
    );
    return Effect.gen(function* () {
      const tester = yield* McpServerTest.McpServerTest;
      const results = yield* Effect.all([tester.test(id), tester.test(id)], {
        concurrency: "unbounded",
      });
      assert.sameDeepMembers(results, [
        { _tag: "Failed", detail: "The server did not answer within 0.5 seconds." },
        { _tag: "Failed", detail: "A test of this server is already running." },
      ]);
      assert.isFalse(isAlive(Number(NodeFS.readFileSync(pidFile, "utf8"))));
    }).pipe(Effect.provide(testWith(stdio(SILENT_SERVER, { PID_FILE: pidFile }))));
  });

  it.live("explains a server that exits, without repeating its secrets", () =>
    Effect.gen(function* () {
      const tester = yield* McpServerTest.McpServerTest;
      assert.deepEqual(yield* tester.test(id), {
        _tag: "Failed",
        detail: "The server stopped before it answered: rejected key [redacted]",
      });
    }).pipe(Effect.provide(testWith(stdio(FAILING_SERVER, { API_KEY: "fixture-secret-key" })))),
  );

  it.live("explains a command that is not installed", () =>
    Effect.gen(function* () {
      const tester = yield* McpServerTest.McpServerTest;
      assert.deepEqual(yield* tester.test(id), {
        _tag: "Failed",
        detail:
          "The command was not found. Use an absolute path or a program on the server's PATH.",
      });
    }).pipe(
      Effect.provide(
        testWith({
          ...stdio("", {}),
          transport: { type: "stdio", command: "dacre-missing-mcp", args: [], env: [] },
        }),
      ),
    ),
  );

  it.live("explains an address nothing listens on", () =>
    Effect.gen(function* () {
      // A port that was free a moment ago, so nothing answers on it.
      const port = yield* Effect.promise(
        () =>
          new Promise<number>((resolve) => {
            const server = NodeNet.createServer().listen(0, "127.0.0.1", () => {
              const { port } = server.address() as NodeNet.AddressInfo;
              server.close(() => resolve(port));
            });
          }),
      );
      const result = yield* McpServerTest.McpServerTest.pipe(
        Effect.flatMap((tester) => tester.test(id)),
        Effect.provide(
          testWith({
            ...stdio("", {}),
            transport: { type: "http", url: `http://127.0.0.1:${port}/mcp`, headers: [] },
          }),
        ),
      );
      assert.deepEqual(result, {
        _tag: "Failed",
        detail: "Could not reach the server (ECONNREFUSED).",
      });
    }),
  );

  it.live("reports a server that is no longer configured", () =>
    Effect.gen(function* () {
      const tester = yield* McpServerTest.McpServerTest;
      assert.deepEqual(yield* tester.test(McpServerId.make("removed")), {
        _tag: "Failed",
        detail: "This server is no longer configured.",
      });
    }).pipe(Effect.provide(testWith(stdio(FIXTURE_SERVER, {})))),
  );
});
