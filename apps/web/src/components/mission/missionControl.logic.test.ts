import type { EnvironmentThreadShell } from "@dacre/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";

import { groupMissionThreads, missionGroupOf, missionNeedOf } from "./missionControl.logic";

const NOW = Date.parse("2026-11-24T12:00:00.000Z");

function shell(overrides: Partial<Record<string, unknown>> = {}): EnvironmentThreadShell {
  return {
    id: "thread-1",
    environmentId: "env-1",
    title: "A thread",
    archivedAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pendingSubagentRequest: null,
    runtime: null,
    latestRun: null,
    updatedAt: "2026-11-24T11:00:00.000Z",
    ...overrides,
  } as unknown as EnvironmentThreadShell;
}

const runtime = (status: string, updatedAt = "2026-11-24T11:30:00.000Z") => ({
  status,
  activeRunId: null,
  providerInstanceId: "claude",
  providerName: "Claude",
  lastError: null,
  updatedAt,
});

describe("missionGroupOf", () => {
  it("puts a thread waiting on the user first, whatever its run is doing", () => {
    expect(
      missionGroupOf(shell({ hasPendingApprovals: true, runtime: runtime("running") }), NOW),
    ).toBe("needs-you");
    expect(missionGroupOf(shell({ hasPendingUserInput: true }), NOW)).toBe("needs-you");
  });

  it("counts a plan ready for review and a waiting guest message as needing the user", () => {
    expect(missionGroupOf(shell({ hasActionableProposedPlan: true }), NOW)).toBe("needs-you");
    expect(missionGroupOf(shell({ pendingGuestMessageCount: 2 }), NOW)).toBe("needs-you");
    // They block no run, so like finished work they leave the board after a day.
    const lastWeek = { updatedAt: "2026-11-17T11:00:00.000Z" };
    expect(missionGroupOf(shell({ ...lastWeek, hasActionableProposedPlan: true }), NOW)).toBeNull();
    expect(missionGroupOf(shell({ ...lastWeek, pendingGuestMessageCount: 1 }), NOW)).toBeNull();
    expect(missionGroupOf(shell({ ...lastWeek, hasPendingApprovals: true }), NOW)).toBe(
      "needs-you",
    );
  });

  it("names the most urgent reason a thread waits on the user", () => {
    const all = {
      hasPendingApprovals: true,
      hasPendingUserInput: true,
      pendingSubagentRequest: { requestId: "r" },
      hasActionableProposedPlan: true,
      pendingGuestMessageCount: 1,
    };
    expect(missionNeedOf(shell(all), NOW)).toBe("approval");
    expect(missionNeedOf(shell({ ...all, hasPendingApprovals: false }), NOW)).toBe("question");
    expect(
      missionNeedOf(shell({ ...all, hasPendingApprovals: false, hasPendingUserInput: false }), NOW),
    ).toBe("subagent");
    expect(
      missionNeedOf(shell({ hasActionableProposedPlan: true, pendingGuestMessageCount: 1 }), NOW),
    ).toBe("plan");
    expect(missionNeedOf(shell({ pendingGuestMessageCount: 1 }), NOW)).toBe("guest");
    expect(missionNeedOf(shell(), NOW)).toBeNull();
  });

  it("shows active runs as running", () => {
    for (const status of ["preparing", "queued", "starting", "running", "waiting"]) {
      expect(missionGroupOf(shell({ runtime: runtime(status) }), NOW), status).toBe("running");
    }
  });

  it("keeps failed and interrupted runs from the last day", () => {
    expect(missionGroupOf(shell({ runtime: runtime("failed") }), NOW)).toBe("failed");
    expect(missionGroupOf(shell({ runtime: runtime("interrupted") }), NOW)).toBe("failed");
    expect(
      missionGroupOf(shell({ runtime: runtime("failed", "2026-11-22T11:30:00.000Z") }), NOW),
    ).toBeNull();
  });

  it("counts a cancelled run as stopped, and leaves out a rollback the user asked for", () => {
    expect(missionGroupOf(shell({ runtime: runtime("cancelled") }), NOW)).toBe("failed");
    expect(missionGroupOf(shell({ runtime: runtime("rolled_back") }), NOW)).toBeNull();
  });

  it("lists runs that finished in the last day", () => {
    expect(missionGroupOf(shell({ runtime: runtime("completed") }), NOW)).toBe("finished");
    expect(
      missionGroupOf(shell({ runtime: runtime("completed", "2026-11-23T11:00:00.000Z") }), NOW),
    ).toBeNull();
  });

  it("leaves out archived and never-run threads", () => {
    expect(
      missionGroupOf(
        shell({ archivedAt: "2026-11-24T10:00:00.000Z", runtime: runtime("running") }),
        NOW,
      ),
    ).toBeNull();
    expect(missionGroupOf(shell(), NOW)).toBeNull();
  });
});

describe("groupMissionThreads", () => {
  it("orders each group by its latest activity, newest first", () => {
    const older = shell({ id: "older", runtime: runtime("running", "2026-11-24T10:00:00.000Z") });
    const newer = shell({ id: "newer", runtime: runtime("running", "2026-11-24T11:59:00.000Z") });
    const groups = groupMissionThreads([older, newer], NOW);
    expect(groups.running.map((thread) => thread.id)).toEqual(["newer", "older"]);
    expect(groups["needs-you"]).toEqual([]);
  });
});
