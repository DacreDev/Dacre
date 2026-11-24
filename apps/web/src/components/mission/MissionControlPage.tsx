import { scopeThreadRef } from "@dacre/client-runtime/environment";
import type { EnvironmentThreadShell } from "@dacre/client-runtime/state/models";
import { resolveAgentMode } from "@dacre/shared/agentModes";
import { useNavigate } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import { RadarIcon } from "lucide-react";
import { useState } from "react";

import { isElectron } from "../../env";
import { useNowMinute } from "../../hooks/useNowMinute";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { useVisibleThreadShells } from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import { DraftProjectGroupLabel, DraftProjectRow } from "../chat/DraftHeroHeadline";
import { useProjectLookups } from "../CommandPaletteLookups";
import { PANE_TAB_CLASS, PaneNotch } from "../PaneNotch";
import { RelativeTime } from "../RelativeTime";
import { ThreadRowLeadingStatus } from "../ThreadStatusIndicators";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { Text } from "../ui/text";
import { toastManager } from "../ui/toast";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  groupMissionThreads,
  MISSION_GROUPS,
  missionNeedOf,
  type MissionGroup,
  type MissionNeed,
} from "./missionControl.logic";

const threadKey = (thread: EnvironmentThreadShell) => `${thread.environmentId}:${thread.id}`;

/** Every agent that is working, waiting on the user, or finished in the last day. */
export function MissionControlPage() {
  const gt = useGT();
  const navigate = useNavigate();
  const threads = useVisibleThreadShells();
  const { projectByKey } = useProjectLookups();
  const nowMinute = useNowMinute();
  const nowMs = Date.parse(`${nowMinute}:00.000Z`);
  const groups = groupMissionThreads(threads, nowMs);
  const interruptTurn = useOrchestrationCommand(threadEnvironment.interruptTurn, {
    reportFailure: false,
  });
  const [stopping, setStopping] = useState<ReadonlySet<string>>(() => new Set());
  const labels: Record<MissionGroup, string> = {
    "needs-you": gt("Needs you"),
    running: gt("Running"),
    failed: gt("Failed or stopped today"),
    finished: gt("Finished today"),
  };
  const empty = MISSION_GROUPS.every((group) => groups[group].length === 0);

  const stop = async (thread: EnvironmentThreadShell) => {
    const key = threadKey(thread);
    setStopping((current) => new Set(current).add(key));
    const result = await interruptTurn({
      environmentId: thread.environmentId,
      input: { threadId: thread.id },
    });
    setStopping((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    if (result._tag === "Failure") {
      toastManager.add({ type: "error", title: gt("Could not stop the agent") });
    }
  };

  const needs: Record<MissionNeed, string> = {
    approval: gt("Waiting for your approval"),
    question: gt("Asked you a question"),
    subagent: gt("Wants to start a subagent"),
    plan: gt("Plan ready for your review"),
    guest: gt("A guest message is waiting"),
  };
  const detailOf = (thread: EnvironmentThreadShell, group: MissionGroup) => {
    const need = group === "needs-you" ? missionNeedOf(thread, nowMs) : null;
    if (need !== null) return needs[need];
    return group === "failed" && thread.runtime?.lastError
      ? thread.runtime.lastError
      : (projectByKey.get(`${thread.environmentId}:${thread.projectId}`)?.title ?? "");
  };
  const modeOf = (thread: EnvironmentThreadShell) =>
    thread.agentMode?.startsWith("custom:")
      ? gt("Custom mode")
      : resolveAgentMode(thread.agentMode, []).label;

  return (
    <SidebarInset
      {...workspaceAreaProps("mission-control", 1, gt("Mission Control"))}
      role="main"
      className="h-dvh min-h-0 overflow-hidden overscroll-y-none"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        <WorkspacePageHeader
          electron={isElectron}
          className="relative z-10 md:pl-0"
          data-pane-header=""
        >
          <div className="flex w-full min-w-0 items-center gap-3 self-stretch">
            <PaneNotch>
              <div className={PANE_TAB_CLASS}>
                <RadarIcon aria-hidden className="size-3.5 shrink-0" />
                <T>Mission Control</T>
              </div>
            </PaneNotch>
          </div>
        </WorkspacePageHeader>
        <div className="scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-200 flex-col gap-6 px-4 py-6 motion-safe:animate-page-in md:px-8 md:py-10">
            <div className="flex flex-col gap-1 px-2.5">
              <Text variant="title" render={<h1 />}>
                <T>Mission Control</T>
              </Text>
              <Text variant="meta" tone="muted" render={<p />}>
                {empty
                  ? gt(
                      "No agents need you. Threads show up here while agents work, when they wait on you, and for a day after they finish.",
                    )
                  : gt(
                      "{running} running, {waiting} waiting on you, {failed} failed or stopped today.",
                      {
                        running: groups.running.length,
                        waiting: groups["needs-you"].length,
                        failed: groups.failed.length,
                      },
                    )}
              </Text>
            </div>
            {MISSION_GROUPS.filter((group) => groups[group].length > 0).map((group) => (
              <section key={group} aria-label={labels[group]} className="flex flex-col gap-0.5">
                <DraftProjectGroupLabel>{labels[group]}</DraftProjectGroupLabel>
                {groups[group].map((thread, index) => {
                  const key = threadKey(thread);
                  return (
                    <div
                      key={key}
                      className="motion-safe:animate-row-in"
                      style={{ animationDelay: `${Math.min(index, 8) * 16}ms` }}
                    >
                      <DraftProjectRow
                        icon={
                          <span className="flex size-4 shrink-0 items-center justify-center">
                            <ThreadRowLeadingStatus thread={thread} />
                          </span>
                        }
                        label={thread.title}
                        detail={detailOf(thread, group)}
                        badge={
                          <span className="flex shrink-0 items-center gap-3 text-meta text-dim-foreground tabular-nums">
                            {thread.runtime?.providerName ? (
                              <span className="hidden md:inline">
                                {thread.runtime.providerName}
                              </span>
                            ) : null}
                            <span className="hidden md:inline">{modeOf(thread)}</span>
                            <RelativeTime
                              timestamp={
                                thread.runtime?.activityStartedAt ??
                                thread.runtime?.updatedAt ??
                                thread.updatedAt
                              }
                            />
                          </span>
                        }
                        action={
                          group === "running" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={stopping.has(key)}
                              onClick={() => void stop(thread)}
                            >
                              <T>Stop</T>
                            </Button>
                          ) : null
                        }
                        onSelect={() =>
                          void navigate({
                            to: "/$environmentId/$threadId",
                            params: buildThreadRouteParams(
                              scopeThreadRef(thread.environmentId, thread.id),
                            ),
                          })
                        }
                      />
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
