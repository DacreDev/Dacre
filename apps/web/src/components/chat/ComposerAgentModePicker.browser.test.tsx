import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { resolveAgentModeOptions } from "./agentModeConfig";
import { ComposerAgentModePicker } from "./ComposerAgentModePicker";

const customMode = {
  id: "custom:11111111-1111-4111-8111-111111111111",
  name: "Docs writer",
  instructions: "Write the docs.",
  readOnly: true,
};

function Picker(props: { readonly onManage?: () => void }) {
  const [value, setValue] = useState("agent");
  return (
    <>
      <ComposerAgentModePicker
        options={resolveAgentModeOptions([customMode])}
        value={value}
        onChange={setValue}
        onManage={props.onManage ?? (() => {})}
      />
      <p role="status">{value}</p>
    </>
  );
}

it("shows every mode with its read-only hint and picks one by keyboard", async () => {
  await using screen = await render(<Picker />, { router: false });
  const trigger = screen.getByRole("button", { name: "Mode: Agent" });
  await userEvent.tab();
  await expect.element(trigger).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");

  for (const name of ["Ask", "Plan", "Architect", "Debug", "Review", "Parallel", "UI/UX", "3D"]) {
    await expect
      .element(page.getByRole("menuitemradio", { name: new RegExp(`^${name}\\b`) }))
      .toBeInTheDocument();
  }
  await expect
    .element(page.getByRole("menuitemradio", { name: /^Docs writer/ }))
    .toBeInTheDocument();
  await expect
    .element(page.getByText("Read-only modes are enforced by the provider where supported."))
    .toBeInTheDocument();
  await expect.element(page.getByRole("menuitem", { name: "Manage custom modes" })).toBeVisible();
  await expect
    .element(page.getByRole("menuitemradio", { name: "Ask, read-only" }))
    .toHaveAccessibleDescription("Answers from the code without changing it.");
  await expect.element(page.getByRole("menuitemradio", { name: "Debug" })).toBeInTheDocument();

  await expect.element(page.getByRole("menuitemradio", { name: /^Agent/ })).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(page.getByRole("menuitemradio", { name: /^Ask/ })).toHaveFocus();
  await userEvent.keyboard("{Enter}");

  await expect.element(screen.getByRole("status")).toHaveTextContent("ask");
  await expect.element(screen.getByRole("button", { name: "Mode: Ask" })).toBeInTheDocument();
});

it("opens custom mode management from the menu", async () => {
  const onManage = vi.fn();
  await using screen = await render(<Picker onManage={onManage} />, { router: false });
  await screen.getByRole("button", { name: "Mode: Agent" }).click();
  await page.getByRole("menuitem", { name: "Manage custom modes" }).click();
  expect(onManage).toHaveBeenCalledOnce();
});
