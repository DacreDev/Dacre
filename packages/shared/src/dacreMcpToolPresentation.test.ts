import { describe, expect, it } from "vite-plus/test";

import {
  DA_MCP_TOOL_NAMES,
  resolveDacreMcpSummaryAction,
  resolveDacreMcpToolDefinition,
  resolveDacreMcpToolPresentation,
} from "./dacreMcpToolPresentation.ts";

describe("resolveDacreMcpToolPresentation", () => {
  it("recognizes every Dacre tool across provider prefixes and completion suffixes", () => {
    for (const tool of DA_MCP_TOOL_NAMES) {
      const presentation = resolveDacreMcpToolPresentation(tool);
      for (const prefix of [
        "mcp__dacre__",
        "Dacre.",
        "dacre.",
        "dacre-direct.",
        "mcp__dacre_direct__",
        "dacre/",
        "dacre:",
        "mcp_dacre_",
        "Dacre ",
        "dacre · ",
      ]) {
        expect(resolveDacreMcpToolPresentation(`${prefix}${tool} completed`), tool).toEqual(
          presentation,
        );
      }
      expect(resolveDacreMcpToolPresentation(`mcp__another-server__${tool}`), tool).toBeNull();
    }
  });

  it("matches OpenCode 2's per-thread server names, whose thread ids hold underscores", () => {
    expect(
      resolveDacreMcpToolPresentation("dacre-thread_opencode2-adapter_delegate_task")?.displayName,
    ).toBe("Delegate a child task");
    expect(resolveDacreMcpToolPresentation("dacre-thread_opencode2-adapter_not_a_tool")).toBeNull();
  });
});

describe("resolveDacreMcpToolDefinition", () => {
  it("labels an action tool call as the action it ran", () => {
    expect(
      resolveDacreMcpToolDefinition("mcp__dacre__preview_act", { action: "type" })?.labels,
    ).toEqual(resolveDacreMcpToolDefinition("preview_type")?.labels);
    expect(
      resolveDacreMcpToolDefinition("dacre_thread_transfer", { action: "fork" })?.displayName,
    ).toBe(resolveDacreMcpToolDefinition("dacre_thread_fork")?.displayName);
    expect(resolveDacreMcpToolDefinition("preview_act", { action: "unknown" })?.labels[2]).toBe(
      "Used",
    );
  });
});

describe("resolveDacreMcpSummaryAction", () => {
  it("summarizes an action tool by the action each call ran", () => {
    expect(resolveDacreMcpSummaryAction("mcp__dacre__dacre_queue", { action: "list" })).toBe(
      "queue-list",
    );
    expect(resolveDacreMcpSummaryAction("dacre_queue", { action: "edit" })).toBe("queue-edit");
    expect(resolveDacreMcpSummaryAction("dacre_thread_transfer", { action: "status" })).toBe(
      "thread-transfers",
    );
    expect(resolveDacreMcpSummaryAction("dacre_thread_configure", {})).toBe("thread-configuration");
    expect(resolveDacreMcpSummaryAction("schedule_task", { scheduledTaskId: "task-1" })).toBe(
      "schedule-update",
    );
    expect(resolveDacreMcpSummaryAction("delegate_task", { task: "x" })).toBe("delegate");
  });
});
