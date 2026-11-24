import { McpServerId, ProjectId, type McpServerConfigs } from "@dacre/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  supportedUserMcpServers,
  userMcpServersFromSettings,
  withAgentDeviceEnvironment,
} from "./mcpSession.ts";

describe("user MCP servers", () => {
  const servers: McpServerConfigs = {
    [McpServerId.make("github")]: {
      name: "github",
      enabled: true,
      transport: {
        type: "stdio",
        command: "npx",
        args: ["-y", "server-github"],
        env: [{ name: "GITHUB_TOKEN", value: "fixture-token" }],
      },
      scope: { kind: "all" },
    },
    [McpServerId.make("docs")]: {
      name: "docs",
      enabled: true,
      transport: {
        type: "http",
        url: "https://example.com/mcp",
        headers: [{ name: "Authorization", value: "Bearer fixture" }],
      },
      scope: { kind: "project", projectId: ProjectId.make("work") },
    },
    [McpServerId.make("off")]: {
      name: "off",
      enabled: false,
      transport: { type: "stdio", command: "off", args: [], env: [] },
      scope: { kind: "all" },
    },
  };
  const github = {
    name: "github",
    type: "stdio",
    command: "npx",
    args: ["-y", "server-github"],
    env: { GITHUB_TOKEN: "fixture-token" },
  } as const;
  const docs = {
    name: "docs",
    type: "http",
    url: "https://example.com/mcp",
    headers: { Authorization: "Bearer fixture" },
  } as const;

  it("gives a thread the enabled servers for every project and for its own", () => {
    expect(userMcpServersFromSettings(servers, ProjectId.make("work"))).toEqual([github, docs]);
    expect(userMcpServersFromSettings(servers, ProjectId.make("home"))).toEqual([github]);
  });

  it("leaves out what a provider cannot start", () => {
    const inFolder = { ...github, name: "local", cwd: "/srv/mcp" };
    const all = [github, inFolder, docs];
    expect(
      supportedUserMcpServers({ stdio: true, http: false, workingDirectory: false }, all),
    ).toEqual([github]);
    expect(
      supportedUserMcpServers({ stdio: true, http: true, workingDirectory: true }, all),
    ).toEqual(all);
    expect(
      supportedUserMcpServers({ stdio: false, http: true, workingDirectory: false }, all),
    ).toEqual([docs]);
    expect(supportedUserMcpServers(undefined, all)).toEqual([]);
  });
});

describe("device CLI environment", () => {
  it("preserves provider credentials and commands while routing devices to the owned daemon", () => {
    const environment = withAgentDeviceEnvironment(
      { PATH: "/provider/bin:/usr/bin", PROVIDER_KEY: "fixture" },
      {
        agentDeviceEnvironment: {
          PATH: "/dacre/device/bin",
          PATH_SEPARATOR: ":",
          AGENT_DEVICE_DAEMON_BASE_URL: "http://127.0.0.1:9000",
          AGENT_DEVICE_DAEMON_AUTH_TOKEN: "fixture-device",
        },
      },
    );
    expect(environment).toEqual({
      PATH: "/dacre/device/bin:/provider/bin:/usr/bin",
      PROVIDER_KEY: "fixture",
      AGENT_DEVICE_DAEMON_BASE_URL: "http://127.0.0.1:9000",
      AGENT_DEVICE_DAEMON_AUTH_TOKEN: "fixture-device",
    });
  });

  it("does not grant CLI access when device access was not supplied", () => {
    const environment = { PATH: "/usr/bin", PROVIDER_KEY: "fixture" };
    expect(withAgentDeviceEnvironment(environment, undefined)).toBe(environment);
    expect(withAgentDeviceEnvironment(environment, {})).toBe(environment);
  });
});
