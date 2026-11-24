import type { CustomAgentMode } from "@dacre/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@dacre/contracts/settings";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import "../../index.css";
import type { ScopedSettingsPatch } from "./scopedSettings";

const state = vi.hoisted(() => ({
  modes: [] as ReadonlyArray<CustomAgentMode>,
  mixed: false,
  updateSettings: vi.fn<(patch: ScopedSettingsPatch) => void>(),
}));

vi.mock(import("./useScopedSettings"), async (original) => ({
  ...(await original()),
  useScopedSettings: (() => ({
    ...DEFAULT_UNIFIED_SETTINGS,
    customAgentModes: state.modes,
  })) as never,
  useScopedSettingsMixed: () => state.mixed,
  useUpdateScopedSettings: () => state.updateSettings,
}));
vi.mock(import("./settingsLayout"), async (original) => ({
  ...(await original()),
  SettingsRow: ({ control, children, description }) => (
    <div>
      <p>{description}</p>
      {control}
      {children}
    </div>
  ),
}));

import { CustomAgentModesRow } from "./CustomAgentModesSettings";

const existing: CustomAgentMode = {
  id: "custom:11111111-1111-4111-8111-111111111111",
  name: "Docs writer",
  instructions: "Write the docs.",
  readOnly: false,
};

const reset = (modes: ReadonlyArray<CustomAgentMode>, mixed = false) => {
  state.modes = modes;
  state.mixed = mixed;
  state.updateSettings.mockReset();
};

describe("CustomAgentModesRow", () => {
  it("creates a read-only mode with a custom id", async () => {
    reset([]);
    await using _screen = await render(<CustomAgentModesRow />, { router: false });
    await page.getByRole("button", { name: "Add mode" }).click();

    const save = page.getByRole("button", { name: "Save mode" });
    await expect.element(save).toBeDisabled();
    await page.getByRole("textbox", { name: "Name" }).fill("  Auditor  ");
    await page.getByRole("textbox", { name: "Instructions" }).fill("Audit the code.");
    await page.getByRole("switch", { name: "Read-only" }).click();
    await save.click();

    expect(state.updateSettings).toHaveBeenCalledOnce();
    const [mode] = state.updateSettings.mock.calls[0]![0].customAgentModes ?? [];
    expect(mode).toMatchObject({
      name: "Auditor",
      instructions: "Audit the code.",
      readOnly: true,
    });
    expect(mode?.id).toMatch(/^custom:[0-9a-f-]{36}$/);
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("edits a mode in place", async () => {
    reset([existing]);
    await using _screen = await render(<CustomAgentModesRow />, { router: false });
    await page.getByRole("button", { name: "Edit Docs writer" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill("Docs");
    await page.getByRole("button", { name: "Save mode" }).click();

    expect(state.updateSettings).toHaveBeenCalledWith({
      customAgentModes: [{ ...existing, name: "Docs" }],
    });
  });

  it("deletes a mode only after a second press", async () => {
    reset([existing]);
    await using _screen = await render(<CustomAgentModesRow />, { router: false });
    await page.getByRole("button", { name: "Edit Docs writer" }).click();

    await page.getByRole("button", { name: "Delete" }).click();
    expect(state.updateSettings).not.toHaveBeenCalled();
    await page.getByRole("button", { name: "Confirm delete" }).click();

    expect(state.updateSettings).toHaveBeenCalledWith({ customAgentModes: [] });
  });

  it("does not offer edits while environments hold different lists", async () => {
    reset([existing], true);
    await using _screen = await render(<CustomAgentModesRow />, { router: false });

    await expect.element(page.getByRole("button", { name: "Add mode" })).toBeDisabled();
    await expect
      .element(page.getByRole("button", { name: "Edit Docs writer" }))
      .not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  });
});
