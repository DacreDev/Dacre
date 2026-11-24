import { ProjectId, type McpServerConfig } from "@dacre/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  configFromDraft,
  draftFromConfig,
  emptyMcpServerDraft,
  parseMcpServersImport,
} from "./McpServersSettings.logic";

const SAVED = "••••••";

describe("parseMcpServersImport", () => {
  it("reads Claude Desktop and Cursor configs, keeping every value for secret storage", () => {
    const result = parseMcpServersImport(
      JSON.stringify({
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_fixture" },
          },
          docs: { url: "https://example.com/mcp", headers: { Authorization: "Bearer fixture" } },
          off: { command: "uvx", args: ["mcp-server-time"], disabled: true },
        },
      }),
      [],
    );
    expect(result).toEqual({
      servers: [
        {
          name: "github",
          enabled: true,
          transport: {
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: [{ name: "GITHUB_PERSONAL_ACCESS_TOKEN", value: "ghp_fixture" }],
          },
          scope: { kind: "all" },
        },
        {
          name: "docs",
          enabled: true,
          transport: {
            type: "http",
            url: "https://example.com/mcp",
            headers: [{ name: "Authorization", value: "Bearer fixture" }],
          },
          scope: { kind: "all" },
        },
        {
          name: "off",
          enabled: false,
          transport: { type: "stdio", command: "uvx", args: ["mcp-server-time"], env: [] },
          scope: { kind: "all" },
        },
      ],
      skipped: [],
      plainSecrets: [],
    });
  });

  it("skips what it cannot save and names secrets that would stay in plain text", () => {
    const result = parseMcpServersImport(
      JSON.stringify({
        mcpServers: {
          shell: { command: "npx -y some-server" },
          legacy: { type: "sse", url: "https://example.com/sse" },
          existing: { command: "npx" },
          keyed: { command: "npx", args: ["server", "--api-key=sk-live-1234567890"] },
          dacre: { command: "npx" },
        },
      }),
      [{ name: "Existing" }],
    );
    expect(result).toMatchObject({
      servers: [{ name: "keyed" }],
      skipped: [
        { name: "shell", reason: expect.stringContaining("absolute path") },
        { name: "legacy", reason: expect.stringContaining("SSE") },
        { name: "existing", reason: expect.stringContaining("already") },
        { name: "dacre", reason: expect.stringContaining("reserved") },
      ],
      plainSecrets: ["keyed"],
    });
  });

  it.each([
    ["text that is not JSON", "{ mcpServers"],
    ["JSON without mcpServers", JSON.stringify({ servers: [] })],
  ])("explains %s", (_label, text) => {
    expect(parseMcpServersImport(text, [])).toMatchObject({ error: expect.any(String) });
  });
});

describe("MCP server drafts", () => {
  const saved: McpServerConfig = {
    name: "github",
    enabled: true,
    transport: {
      type: "stdio",
      command: "npx",
      args: ["-y", "server github"],
      env: [
        { name: "GITHUB_TOKEN", value: SAVED },
        { name: "OLD_NAME", value: SAVED },
      ],
    },
    scope: { kind: "project", projectId: ProjectId.make("work") },
  };

  it("keeps a stored value unless the row is renamed or given a new one", () => {
    const draft = draftFromConfig(saved);
    const [token, renamed] = draft.env;
    const result = configFromDraft({
      ...draft,
      env: [
        token!,
        { ...renamed!, name: "NEW_NAME" },
        { key: "added", name: "ADDED", saved: "", value: "fixture" },
      ],
    });
    expect(result).toEqual({
      config: {
        ...saved,
        transport: {
          ...saved.transport,
          env: [
            { name: "GITHUB_TOKEN", value: SAVED },
            { name: "NEW_NAME", value: "" },
            { name: "ADDED", value: "fixture" },
          ],
        },
      },
    });
  });

  it("splits arguments by line and explains an invalid server", () => {
    expect(
      configFromDraft({
        ...emptyMcpServerDraft(),
        name: "files",
        command: "npx",
        args: "-y\n@modelcontextprotocol/server-filesystem\n/Users/me/My Files\n",
      }),
    ).toMatchObject({
      config: {
        transport: {
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/My Files"],
        },
      },
    });
    expect(
      configFromDraft({ ...emptyMcpServerDraft(), name: "files", command: "npx -y x" }),
    ).toEqual({ error: expect.stringContaining("absolute path") });
  });
});
