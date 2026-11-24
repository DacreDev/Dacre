import { scopeProjectRef, scopeThreadRef } from "@dacre/client-runtime/environment";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { T, useGT, useMessages } from "gt-react";
import { HouseIcon, SquarePenIcon } from "lucide-react";
import type { ReactNode } from "react";

import { openCommandPalette } from "../../commandPaletteBus";
import { isElectron } from "../../env";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useScratchProject } from "../../hooks/useScratchProject";
import { shortcutLabelForCommand } from "../../keybindings";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { useDelegatedUnderParent } from "../../state/entities";
import { primaryServerKeybindingsAtom, primaryServerProvidersAtom } from "../../state/server";
import { buildThreadRouteParams } from "../../threadRoutes";
import {
  DraftProjectGroupLabel,
  DraftProjectRow,
  ProjectPickerRows,
  useProjectPickerModel,
  type ProjectPickerEntry,
} from "../chat/DraftHeroHeadline";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { useProjectLookups } from "../CommandPaletteLookups";
import { useRecentThreads } from "../CommandPaletteThreadItems";
import { PANE_TAB_CLASS, PaneNotch } from "../PaneNotch";
import { RelativeTime } from "../RelativeTime";
import { getProviderSummary } from "../settings/providerStatus";
import { ThreadRowLeadingStatus } from "../ThreadStatusIndicators";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { Text } from "../ui/text";
import { WorkspacePageHeader } from "../WorkspacePageHeader";

const RECENT_THREADS_SHOWN = 8;

function HomeSection(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <section aria-label={props.label} className="flex min-w-0 flex-col gap-0.5">
      <DraftProjectGroupLabel>{props.label}</DraftProjectGroupLabel>
      {props.children}
    </section>
  );
}

/** Where to pick up: recent threads, projects, and which agents are ready. */
export function HomePage() {
  const gt = useGT();
  const messages = useMessages();
  const navigate = useNavigate();
  const delegatedUnderParent = useDelegatedUnderParent();
  const recentThreads = useRecentThreads(null, delegatedUnderParent).slice(0, RECENT_THREADS_SHOWN);
  const { projectByKey } = useProjectLookups();
  const model = useProjectPickerModel(null);
  const handleNewThread = useNewThreadHandler();
  const { startScratchThread } = useScratchProject();
  const providers = useAtomValue(primaryServerProvidersAtom).filter((provider) => provider.enabled);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const firstEntry = model.pinnedEntries[0] ?? model.recentEntries[0] ?? null;

  const startInProject = (entry: ProjectPickerEntry) =>
    void handleNewThread(
      scopeProjectRef(entry.targetProject.environmentId, entry.targetProject.id),
    );
  const startWithoutProject = () => {
    if (model.scratchTargetEnvironmentId !== null) {
      void startScratchThread(model.scratchTargetEnvironmentId);
    }
  };
  const startThread = () => {
    if (firstEntry !== null) startInProject(firstEntry);
    else if (model.scratchTargetEnvironmentId !== null) startWithoutProject();
    else openCommandPalette({ open: "add-project" });
  };

  return (
    <SidebarInset
      {...workspaceAreaProps("home", 1, gt("Home"))}
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
                <HouseIcon aria-hidden className="size-3.5 shrink-0" />
                <T>Home</T>
              </div>
            </PaneNotch>
          </div>
        </WorkspacePageHeader>
        <div className="scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-240 flex-col gap-6 px-4 py-6 motion-safe:animate-page-in md:px-8 md:py-10">
            <div className="flex flex-wrap items-center justify-between gap-3 px-2.5">
              <Text variant="title" render={<h1 />}>
                <T>Home</T>
              </Text>
              <Button size="sm" onClick={startThread}>
                <SquarePenIcon />
                <T>New thread</T>
              </Button>
            </div>
            <div className="grid min-w-0 gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <HomeSection label={gt("Continue")}>
                {recentThreads.length === 0 ? (
                  <div className="px-2.5 py-1.5">
                    <Text variant="meta" tone="muted" render={<p />}>
                      <T>Threads you work in will show up here.</T>
                    </Text>
                  </div>
                ) : (
                  recentThreads.map((thread, index) => (
                    <div
                      key={`${thread.environmentId}:${thread.id}`}
                      className="motion-safe:animate-row-in"
                      style={{ animationDelay: `${index * 16}ms` }}
                    >
                      <DraftProjectRow
                        icon={
                          <span className="flex size-4 shrink-0 items-center justify-center">
                            <ThreadRowLeadingStatus thread={thread} />
                          </span>
                        }
                        label={thread.title}
                        detail={
                          projectByKey.get(`${thread.environmentId}:${thread.projectId}`)?.title ??
                          ""
                        }
                        badge={
                          <span className="shrink-0 text-meta text-dim-foreground tabular-nums">
                            <RelativeTime timestamp={thread.updatedAt} />
                          </span>
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
                  ))
                )}
              </HomeSection>
              <div className="flex min-w-0 flex-col gap-6">
                <HomeSection label={gt("Start a thread in")}>
                  <ProjectPickerRows
                    model={model}
                    groupLabels={false}
                    concise
                    selectedProjectKey={null}
                    scratchSelected={false}
                    onChooseEntry={startInProject}
                    onNoProject={startWithoutProject}
                  />
                </HomeSection>
                <HomeSection label={gt("Agents")}>
                  {providers.length === 0 ? (
                    <div className="px-2.5 py-1.5">
                      <Text variant="meta" tone="muted" render={<p />}>
                        <T>Checking which agents are installed.</T>
                      </Text>
                    </div>
                  ) : (
                    providers.map((provider) => {
                      const name = provider.displayName ?? provider.driver;
                      return (
                        <DraftProjectRow
                          key={provider.instanceId}
                          icon={
                            <ProviderInstanceIcon
                              driverKind={provider.driver}
                              displayName={name}
                              iconClassName="size-4"
                            />
                          }
                          label={name}
                          detail={getProviderSummary(provider, messages).headline}
                          onSelect={() => void navigate({ to: "/settings/providers" })}
                        />
                      );
                    })
                  )}
                </HomeSection>
              </div>
            </div>
            {shortcutLabelForCommand(keybindings, "commandPalette.toggle") ? (
              <div className="px-2.5">
                <Text variant="meta" tone="muted" render={<p />}>
                  {gt("Press {shortcut} to search everything.", {
                    shortcut: shortcutLabelForCommand(keybindings, "commandPalette.toggle") ?? "",
                  })}
                </Text>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
