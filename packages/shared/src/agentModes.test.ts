import type { CustomAgentMode } from "@dacre/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  AGENT_MODES,
  agentModeIdForThread,
  DEFAULT_AGENT_MODE_ID,
  nextAgentModeId,
  resolveAgentMode,
  storedInteractionModeForAgentMode,
  withAgentModeInstructions,
} from "./agentModes.ts";

const custom: CustomAgentMode = {
  id: "custom:11111111-1111-4111-8111-111111111111",
  name: "Docs writer",
  instructions: "Write the docs.",
  readOnly: true,
};

describe("resolveAgentMode", () => {
  it("defaults to Agent, with no instructions and write access", () => {
    for (const id of [undefined, null, "agent"]) {
      const mode = resolveAgentMode(id, []);
      expect(mode.id).toBe(DEFAULT_AGENT_MODE_ID);
      expect(mode.readOnly).toBe(false);
      expect(mode.instructions).toBeUndefined();
    }
  });

  it("finds built-in and custom modes", () => {
    expect(resolveAgentMode("review", []).readOnly).toBe(true);
    expect(resolveAgentMode("debug", []).readOnly).toBe(false);
    expect(resolveAgentMode(custom.id, [custom])).toMatchObject({
      id: custom.id,
      label: "Docs writer",
      readOnly: true,
      instructions: "Write the docs.",
    });
  });

  it("resolves an unknown or deleted mode to Agent", () => {
    expect(resolveAgentMode("custom:deleted", [custom]).id).toBe("agent");
    expect(resolveAgentMode(custom.id, []).id).toBe("agent");
    expect(resolveAgentMode("nonsense", []).readOnly).toBe(false);
  });

  it("marks exactly the documented modes read-only", () => {
    expect(AGENT_MODES.filter((mode) => mode.readOnly).map((mode) => mode.id)).toEqual([
      "ask",
      "plan",
      "architect",
      "review",
      "research",
    ]);
  });
});

describe("withAgentModeInstructions", () => {
  it("leaves the text alone for a mode without instructions", () => {
    expect(withAgentModeInstructions("hello", resolveAgentMode("agent", []))).toBe("hello");
    expect(withAgentModeInstructions("hello", resolveAgentMode("plan", []))).toBe("hello");
  });

  it("keeps empty text empty so a resume can still detect it", () => {
    expect(withAgentModeInstructions("", resolveAgentMode("ask", []))).toBe("");
  });

  it("appends a dacre_mode block after the user's words", () => {
    const text = withAgentModeInstructions("Why is it slow?", resolveAgentMode("performance", []));
    expect(text.startsWith("Why is it slow?\n\n<dacre_mode>\n")).toBe(true);
    expect(text.endsWith("\n</dacre_mode>")).toBe(true);
    expect(text).toContain("Measure before changing anything.");
  });
});

describe("storedInteractionModeForAgentMode", () => {
  it("stores Plan for read-only modes and keeps the default otherwise", () => {
    expect(storedInteractionModeForAgentMode(resolveAgentMode("ask", []))).toBe("plan");
    expect(storedInteractionModeForAgentMode(resolveAgentMode("debug", []))).toBe("default");
    expect(storedInteractionModeForAgentMode(resolveAgentMode(custom.id, [custom]))).toBe("plan");
  });
});

describe("agentModeIdForThread", () => {
  it("reads a thread with no agent mode from its interaction mode", () => {
    expect(agentModeIdForThread({ agentMode: undefined, interactionMode: "default" })).toBe(
      "agent",
    );
    expect(agentModeIdForThread({ agentMode: undefined, interactionMode: "plan" })).toBe("plan");
    expect(agentModeIdForThread({ agentMode: "agent", interactionMode: "plan" })).toBe("plan");
    expect(agentModeIdForThread({ agentMode: "review", interactionMode: "plan" })).toBe("review");
    expect(agentModeIdForThread({ agentMode: "debug", interactionMode: "default" })).toBe("debug");
  });
});

describe("nextAgentModeId", () => {
  const offered = [{ id: "agent" }, { id: "ask" }, { id: custom.id }];

  it("steps through the offered modes and wraps around", () => {
    expect(nextAgentModeId("agent", offered)).toBe("ask");
    expect(nextAgentModeId("ask", offered)).toBe(custom.id);
    expect(nextAgentModeId(custom.id, offered)).toBe("agent");
  });

  it("restarts from the top for a mode no longer offered", () => {
    expect(nextAgentModeId("plan", offered)).toBe("agent");
  });

  it("stays put with nothing to cycle to", () => {
    expect(nextAgentModeId("agent", [])).toBe("agent");
  });
});
