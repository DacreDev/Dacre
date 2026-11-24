import { AGENT_MODES } from "@dacre/shared/agentModes";
import { describe, expect, it } from "vite-plus/test";

import { replaceCustomAgentMode } from "../settings/CustomAgentModesSettings";
import { resolveAgentModeOptions } from "./agentModeConfig";

const custom = {
  id: "custom:11111111-1111-4111-8111-111111111111",
  name: "Docs",
  instructions: "Write the docs.\nKeep them short.",
  readOnly: true,
};

describe("resolveAgentModeOptions", () => {
  it("lists every built-in mode with a label, description and icon, then custom modes", () => {
    const options = resolveAgentModeOptions([custom]);
    expect(options.map((option) => option.id)).toEqual([
      ...AGENT_MODES.map((mode) => mode.id),
      custom.id,
    ]);
    for (const option of options) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
      expect(option.icon).toBeDefined();
    }
    expect(options.find((option) => option.id === "design")?.label).toBe("UI/UX");
  });

  it("describes a custom mode by the first line of its instructions", () => {
    const option = resolveAgentModeOptions([custom]).at(-1);
    expect(option).toMatchObject({
      label: "Docs",
      description: "Write the docs.",
      readOnly: true,
      custom: true,
    });
  });
});

describe("replaceCustomAgentMode", () => {
  it("appends a new mode and updates an existing one in place", () => {
    const other = { ...custom, id: "custom:22222222-2222-4222-8222-222222222222", name: "Other" };
    expect(replaceCustomAgentMode([custom], other)).toEqual([custom, other]);
    expect(replaceCustomAgentMode([custom, other], { ...custom, name: "Renamed" })).toEqual([
      { ...custom, name: "Renamed" },
      other,
    ]);
  });
});
