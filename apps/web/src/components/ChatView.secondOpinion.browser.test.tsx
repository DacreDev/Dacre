import "~/index.css";
import { createMemoryHistory } from "@tanstack/react-router";
import { DEFAULT_CLIENT_SETTINGS } from "@dacre/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes seconds; keep it out of the test.
import "~/components/ChatView";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  CLAUDE_PROVIDER,
  CODEX_PROVIDER,
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

// Its own file: the app's server config, which lists the providers, outlives a test.
it("reviews the latest turn's files in a Review side chat on the picked provider", async () => {
  await page.viewport(1400, 900);
  const thread = {
    ...threadWithHistory("thread-second-opinion", 1),
    changedFiles: ["src/sidebar.ts", "src/sidebar.test.ts"],
  };
  using _environment = installFakeEnvironment([thread], {
    acceptCommands: true,
    providers: [CODEX_PROVIDER, CLAUDE_PROVIDER],
  });
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

  await page.getByRole("button", { name: "Second opinion" }).click();
  // Another agent first; the thread's own provider stays on offer.
  const providers = page.getByRole("menuitem");
  await expect.element(providers.nth(0)).toHaveTextContent("Claude");
  await expect.element(providers.nth(1)).toMatchTextContent(/^Codex.*This thread$/);
  await providers.nth(0).click();

  await expect.element(page.getByRole("button", { name: "Side chat", exact: true })).toBeVisible();
  const commands = dispatchedCommands();
  const fork = commands.find((command) => command.type === "thread.fork");
  expect(fork).toMatchObject({ sourceThreadId: thread.id, sideChat: true });
  const sideChatId = fork?.type === "thread.fork" ? fork.targetThreadId : null;
  const modeIndex = commands.findIndex(
    (command) =>
      command.type === "thread.metadata.update" &&
      command.threadId === sideChatId &&
      command.agentMode === "review",
  );
  const messageIndex = commands.findIndex(
    (command) => command.type === "message.dispatch" && command.threadId === sideChatId,
  );
  // The mode must be on the side chat before its turn starts.
  expect(modeIndex).toBeGreaterThanOrEqual(0);
  expect(modeIndex).toBeLessThan(messageIndex);
  expect(commands[messageIndex]).toMatchObject({
    modelSelection: { instanceId: CLAUDE_PROVIDER.instanceId, model: "claude-opus-4-6" },
    text: expect.stringContaining("- `src/sidebar.ts`\n- `src/sidebar.test.ts`\n"),
  });
  // The thread itself gets no message.
  expect(
    commands.filter(
      (command) => command.type === "message.dispatch" && command.threadId === thread.id,
    ),
  ).toEqual([]);
});
