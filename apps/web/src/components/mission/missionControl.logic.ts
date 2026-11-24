import {
  threadRuntimeIsActive,
  type EnvironmentThreadShell,
} from "@dacre/client-runtime/state/models";

export type MissionGroup = "needs-you" | "running" | "failed" | "finished";

export const MISSION_GROUPS: ReadonlyArray<MissionGroup> = [
  "needs-you",
  "running",
  "failed",
  "finished",
];

// Finished and failed runs stay on the board for a day, then live only in the sidebar.
const RECENT_MS = 24 * 60 * 60 * 1000;

const activityAt = (thread: EnvironmentThreadShell) =>
  Date.parse(thread.runtime?.updatedAt ?? thread.updatedAt);

export type MissionNeed = "approval" | "question" | "subagent" | "plan" | "guest";

/** Why a thread waits on the user, most urgent first, or null when it does not. */
export function missionNeedOf(thread: EnvironmentThreadShell, nowMs: number): MissionNeed | null {
  if (thread.hasPendingApprovals) return "approval";
  if (thread.hasPendingUserInput) return "question";
  if (thread.pendingSubagentRequest) return "subagent";
  // A plan or a guest message blocks no run, so old ones leave the board like finished work.
  if (nowMs - activityAt(thread) >= RECENT_MS) return null;
  if (thread.hasActionableProposedPlan) return "plan";
  if ((thread.pendingGuestMessageCount ?? 0) > 0) return "guest";
  return null;
}

/** Where a thread sits on Mission Control, or null when it is not worth showing there. */
export function missionGroupOf(thread: EnvironmentThreadShell, nowMs: number): MissionGroup | null {
  if (thread.archivedAt !== null) return null;
  if (missionNeedOf(thread, nowMs) !== null) return "needs-you";
  if (threadRuntimeIsActive(thread.runtime)) return "running";
  if (nowMs - activityAt(thread) >= RECENT_MS) return null;
  const status = thread.runtime?.status;
  // A cancelled run stopped without finishing, often on a shutdown; a rollback was the user's own.
  if (status === "failed" || status === "interrupted" || status === "cancelled") return "failed";
  if (status === "completed") return "finished";
  return null;
}

export function groupMissionThreads(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  nowMs: number,
): Record<MissionGroup, EnvironmentThreadShell[]> {
  const groups: Record<MissionGroup, EnvironmentThreadShell[]> = {
    "needs-you": [],
    running: [],
    failed: [],
    finished: [],
  };
  for (const thread of threads) {
    const group = missionGroupOf(thread, nowMs);
    if (group !== null) groups[group].push(thread);
  }
  for (const group of MISSION_GROUPS) {
    groups[group].sort((left, right) => activityAt(right) - activityAt(left));
  }
  return groups;
}
