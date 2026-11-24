import {
  EnvironmentId,
  McpServerId,
  ProviderDriverKind,
  ProviderInstanceId,
  type McpServerConfigs,
  type ServerProvider,
} from "@dacre/contracts";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import "../../index.css";

const environmentId = EnvironmentId.make("environment-mcp");
const github = McpServerId.make("github-id");

const state = vi.hoisted(() => ({
  servers: {} as McpServerConfigs,
  providers: [] as ReadonlyArray<ServerProvider>,
  update: vi.fn(),
  test: vi.fn(),
}));

vi.mock(import("../../state/server"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  const allowed = Atom.make(true);
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      testMcpServer: { ...actual.serverEnvironment.testMcpServer, permissionAtom: () => allowed },
    },
  };
});
vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => state.test) as never,
}));
vi.mock(import("../../hooks/useSettings"), async (original) => ({
  ...(await original()),
  useEnvironmentSettings: ((_id: unknown, select: (settings: unknown) => unknown) =>
    select({ mcpServers: state.servers })) as never,
  useUpdateEnvironmentSettings: () => state.update,
}));
vi.mock(import("../../state/entities"), async (original) => ({
  ...(await original()),
  useProjects: () => [],
}));
vi.mock(import("../../state/environments"), async (original) => ({
  ...(await original()),
  useEnvironmentProviders: () => new Map([[environmentId, state.providers]]),
}));
vi.mock(import("./SettingsScopeContext"), async (original) => ({
  ...(await original()),
  useSettingsScope: (() => ({
    scope: { kind: "environment" },
    environment: {
      environmentId,
      label: "Laptop",
      connection: { phase: "connected" },
      serverConfig: { mcpServerSettings: true },
    },
  })) as never,
}));
vi.mock(import("./settingsLayout"), async (original) => ({
  ...(await original()),
  SettingsPageContainer: (({ children }: { children: ReactNode }) => children) as never,
  SettingsSection: (({
    title,
    headerAction,
    children,
  }: {
    title: string;
    headerAction?: ReactNode;
    children: ReactNode;
  }) => (
    <section aria-label={title}>
      {headerAction}
      {children}
    </section>
  )) as never,
  SettingsRow: (({
    title,
    description,
    control,
  }: {
    title: ReactNode;
    description?: ReactNode;
    control?: ReactNode;
  }) => (
    <div>
      <h3>{title}</h3>
      <div>{description}</div>
      {control}
    </div>
  )) as never,
}));

import { McpServersSettingsPanel } from "./McpServersSettings";

const provider = (
  name: string,
  userMcpServers?: ServerProvider["userMcpServers"],
): ServerProvider => ({
  instanceId: ProviderInstanceId.make(name.toLowerCase()),
  driver: ProviderDriverKind.make(name.toLowerCase()),
  displayName: name,
  enabled: true,
  installed: true,
  version: null,
  status: "ready",
  auth: { status: "unknown" },
  checkedAt: "2026-11-24T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
  ...(userMcpServers === undefined ? {} : { userMcpServers }),
});

const setup = () => {
  state.servers = {
    [github]: {
      name: "github",
      enabled: true,
      transport: {
        type: "stdio",
        command: "npx",
        args: ["-y", "server-github"],
        env: [{ name: "GITHUB_TOKEN", value: "••••••" }],
      },
      scope: { kind: "all" },
    },
  };
  state.providers = [
    provider("Claude", { stdio: true, http: true, workingDirectory: false }),
    provider("Pi"),
  ];
  state.update.mockReset();
  state.test.mockReset();
};

describe("McpServersSettingsPanel", () => {
  it("lists a server, tests it, and says which providers receive servers", async () => {
    setup();
    state.test.mockResolvedValue({
      _tag: "Success",
      value: { _tag: "Connected", tools: ["search_issues", "create_issue"] },
    });
    await using _screen = await render(<McpServersSettingsPanel />, { router: false });

    await expect.element(page.getByRole("heading", { name: "github" })).toBeVisible();
    await expect.element(page.getByText("npx -y server-github")).toBeVisible();
    await expect.element(page.getByText("All projects")).toBeVisible();
    await page.getByRole("button", { name: "Test" }).click();
    expect(state.test).toHaveBeenCalledWith({ environmentId, input: { id: github } });
    await expect.element(page.getByText("Connected, 2 tools")).toBeVisible();

    await expect
      .element(
        page.getByText(
          "Receives stdio and HTTP servers, except stdio servers that set a working folder.",
        ),
      )
      .toBeVisible();
    await expect.element(page.getByText("Cannot receive MCP servers from Dacre.")).toBeVisible();
  });

  it("adds a server with a secret variable and removes one only after confirming", async () => {
    setup();
    await using _screen = await render(<McpServersSettingsPanel />, { router: false });

    await page.getByRole("button", { name: "Add server" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill("files");
    await page.getByRole("textbox", { name: "Command" }).fill("npx");
    await page.getByRole("textbox", { name: "Arguments, one per line" }).fill("-y\nserver files");
    await page.getByRole("button", { name: "Add variable" }).click();
    await page.getByRole("textbox", { name: "Environment variable name" }).fill("API_KEY");
    await userEvent.type(page.getByLabelText("Environment variable value"), "fixture-key");
    await page.getByRole("button", { name: "Save server" }).click();

    expect(state.update).toHaveBeenCalledOnce();
    const [patch] = state.update.mock.calls[0]!;
    expect(Object.values(patch.mcpServers)).toEqual([
      {
        name: "files",
        enabled: true,
        transport: {
          type: "stdio",
          command: "npx",
          args: ["-y", "server files"],
          env: [{ name: "API_KEY", value: "fixture-key" }],
        },
        scope: { kind: "all" },
      },
    ]);

    await page.getByRole("button", { name: "Remove" }).click();
    expect(state.update).toHaveBeenCalledOnce();
    await page.getByRole("button", { name: "Remove server" }).click();
    expect(state.update).toHaveBeenLastCalledWith({ mcpServers: { [github]: null } });
  });

  it("shows what an import found before adding it", async () => {
    setup();
    await using _screen = await render(<McpServersSettingsPanel />, { router: false });

    await page.getByRole("button", { name: "Import" }).click();
    await page.getByRole("textbox", { name: "JSON" }).fill(
      JSON.stringify({
        mcpServers: {
          GitHub: { command: "npx" },
          docs: { url: "https://example.com/mcp", headers: { Authorization: "Bearer fixture" } },
        },
      }),
    );
    await expect
      .element(page.getByText("Connects to https://example.com/mcp, 1 secret"))
      .toBeVisible();
    await expect.element(page.getByText("A server with this name already exists.")).toBeVisible();
    expect(state.update).not.toHaveBeenCalled();

    await page.getByRole("button", { name: "Add 1 server" }).click();
    const [patch] = state.update.mock.calls[0]!;
    expect(Object.values(patch.mcpServers)).toMatchObject([
      {
        name: "docs",
        transport: { headers: [{ name: "Authorization", value: "Bearer fixture" }] },
      },
    ]);
  });
});
