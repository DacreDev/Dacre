import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { McpServerConfigs } from "./mcpServer.ts";
import { DEFAULT_SERVER_SETTINGS } from "./settings.ts";

const decode = Schema.decodeUnknownSync(McpServerConfigs);
const stdio = (overrides: Record<string, unknown> = {}) => ({
  name: "github",
  enabled: true,
  transport: { type: "stdio", command: "npx", ...overrides },
  scope: { kind: "all" },
});
const http = (url: string) => ({
  name: "docs",
  enabled: true,
  transport: { type: "http", url, headers: [{ name: "Authorization", value: "" }] },
  scope: { kind: "all" },
});

describe("MCP server settings", () => {
  it("decodes stdio and HTTP servers, defaulting the lists a hand edit leaves out", () => {
    expect(
      decode({
        a: stdio({ args: ["-y", "@modelcontextprotocol/server-github"], cwd: "/srv/mcp" }),
        b: http("https://example.com/mcp"),
      }),
    ).toEqual({
      a: {
        ...stdio(),
        transport: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          cwd: "/srv/mcp",
          env: [],
        },
      },
      b: http("https://example.com/mcp"),
    });
    expect(DEFAULT_SERVER_SETTINGS.mcpServers).toEqual({});
  });

  it.each([
    ["a shell string as the command", stdio({ command: "npx -y server" })],
    ["a relative command path", stdio({ command: "./bin/server" })],
    ["a relative working folder", stdio({ cwd: "srv" })],
    ["Dacre's own server name", { ...stdio(), name: "dacre" }],
    ["a dacre- prefix", { ...stdio(), name: "Dacre-tools" }],
    ["a dot in the name", { ...stdio(), name: "my.server" }],
    ["a non-HTTP URL", http("file:///etc/passwd")],
    ["credentials in the URL", http("https://user:pass@example.com/mcp")],
    [
      "a header value over two lines",
      {
        ...http("https://example.com/mcp"),
        transport: {
          type: "http",
          url: "https://example.com/mcp",
          headers: [{ name: "X-Token", value: "a\r\nHost: evil" }],
        },
      },
    ],
    [
      "one header twice",
      {
        ...http("https://example.com/mcp"),
        transport: {
          type: "http",
          url: "https://example.com/mcp",
          headers: [
            { name: "X-Token", value: "" },
            { name: "x-token", value: "" },
          ],
        },
      },
    ],
  ])("rejects %s", (_label, server) => {
    expect(() => decode({ a: server })).toThrow();
  });

  it("accepts absolute commands on POSIX and Windows", () => {
    expect(() =>
      decode({
        a: stdio({ command: "/usr/local/bin/mcp" }),
        b: { ...stdio({ command: "C:\\Program Files\\nodejs\\node.exe" }), name: "node" },
      }),
    ).not.toThrow();
  });

  it("allows one name twice only for servers that never share a session", () => {
    const forProject = (name: string, projectId: string) => ({
      ...stdio(),
      name,
      scope: { kind: "project", projectId },
    });
    expect(() =>
      decode({ a: forProject("github", "work"), b: forProject("GitHub", "home") }),
    ).not.toThrow();
    expect(() =>
      decode({ a: forProject("github", "work"), b: forProject("github", "work") }),
    ).toThrow();
    expect(() => decode({ a: stdio(), b: forProject("GITHUB", "work") })).toThrow();
  });
});
