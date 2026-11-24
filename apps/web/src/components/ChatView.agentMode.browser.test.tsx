import { createMemoryHistory } from "@tanstack/react-router";
import { DEFAULT_CLIENT_SETTINGS } from "@dacre/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes seconds; keep it out of the test.
import "~/components/ChatView";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  dispatchedCommands,
  ENVIRONMENT_ID,
  type FakeDriver,
  installFakeEnvironment,
  threadWithHistory,
} from "../../test/fakeEnvironment";
import { render } from "../../test/render";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

// Its own file: the app's shell subscription outlives a test.
it("sends a picked mode to the server before the message, and nothing for Agent", async () => {
  const thread = threadWithHistory("thread-agent-mode", 1);
  using _environment = installFakeEnvironment([thread], { acceptCommands: true });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, {
    // AppRoot brings its own router.
    router: false,
  });
  await expect.element(page.getByText("Answer 0 for thread-agent-mode.")).toBeVisible();

  const editor = page.getByTestId("composer-editor");
  await userEvent.click(editor);
  await userEvent.keyboard("Stays on Agent{Enter}");
  await vi.waitFor(() =>
    expect(dispatchedCommands().map((command) => command.type)).toContain("message.dispatch"),
  );
  // The default mode puts nothing new on the wire.
  expect(
    dispatchedCommands().filter(
      (command) => command.type === "thread.metadata.update" && command.agentMode !== undefined,
    ),
  ).toEqual([]);
  expect(dispatchedCommands().map((command) => command.type)).not.toContain(
    "thread.interaction-mode.set",
  );

  await page.getByRole("button", { name: "Mode: Agent" }).click();
  await page.getByRole("menuitemradio", { name: "Review, read-only" }).click();
  await expect.element(page.getByRole("button", { name: "Mode: Review" })).toBeVisible();

  await userEvent.click(editor);
  await userEvent.keyboard("Check this{Enter}");
  await vi.waitFor(() =>
    expect(
      dispatchedCommands().filter(
        (command) => command.type === "message.dispatch" && command.text === "Check this",
      ),
    ).toHaveLength(1),
  );

  const commands = dispatchedCommands();
  const modeIndex = commands.findIndex(
    (command) => command.type === "thread.metadata.update" && command.agentMode === "review",
  );
  const messageIndex = commands.findIndex(
    (command) => command.type === "message.dispatch" && command.text === "Check this",
  );
  expect(modeIndex).toBeGreaterThanOrEqual(0);
  expect(modeIndex).toBeLessThan(messageIndex);

  await userEvent.keyboard("{ControlOrMeta>}.{/ControlOrMeta}");
  await expect.element(page.getByRole("button", { name: "Mode: Parallel" })).toBeVisible();
});

it("switches the mode from the slash menu and leaves the draft empty", async () => {
  const thread = threadWithHistory("thread-agent-mode-slash", 1);
  using _environment = installFakeEnvironment([thread], { acceptCommands: true });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, {
    // AppRoot brings its own router.
    router: false,
  });
  await expect.element(page.getByText("Answer 0 for thread-agent-mode-slash.")).toBeVisible();

  const editor = page.getByTestId("composer-editor");
  await userEvent.click(editor);
  await userEvent.type(editor, "/debug");
  await expect.element(page.getByText("Switch to Debug mode")).toBeVisible();
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByRole("button", { name: "Mode: Debug" })).toBeVisible();
  await expect.element(editor).toHaveTextContent("");

  await userEvent.keyboard("Find the leak{Enter}");
  await vi.waitFor(() =>
    expect(
      dispatchedCommands().filter(
        (command) => command.type === "message.dispatch" && command.text === "Find the leak",
      ),
    ).toHaveLength(1),
  );
  expect(dispatchedCommands()).toContainEqual(
    expect.objectContaining({ type: "thread.metadata.update", agentMode: "debug" }),
  );
});
