import { useAtomValue } from "@effect/atom-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useGT } from "gt-react";
import {
  BrainIcon,
  ChartNoAxesColumnIcon,
  HouseIcon,
  MessagesSquareIcon,
  RadarIcon,
  SearchIcon,
  SettingsIcon,
  WorkflowIcon,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { openCommandPalette } from "../commandPaletteBus";
import { shortcutLabelForCommand } from "../keybindings";
import { beginLayoutContentDrag } from "../layout/layoutDrag";
import { useOpenLayoutPage } from "../layout/pageNavigation";
import { useIssuesSupported, usePullRequestsSupported } from "../state/environments";
import { primaryServerKeybindingsAtom } from "../state/server";
import { IssueGlyph } from "./issue/issuePresentation";
import { PullRequestGlyph } from "./pullRequest/pullRequestIcons";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { useWorkflowEnvironmentIds } from "./workflows/useWorkflowEnvironmentIds";

function RailItem(props: {
  readonly label: string;
  readonly shortcut?: string | null;
  readonly active?: boolean;
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly onPointerDown?: (event: ReactPointerEvent) => void;
}) {
  const gt = useGT();
  return (
    <SidebarMenuItem>
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton
              size="icon"
              isActive={props.active ?? false}
              aria-label={props.label}
              aria-current={props.active ? "page" : undefined}
              onClick={props.onClick}
              onPointerDown={props.onPointerDown}
            />
          }
        >
          {props.children}
        </TooltipTrigger>
        <TooltipPopup side="right">
          {props.shortcut
            ? gt("{label} ({shortcut})", { label: props.label, shortcut: props.shortcut })
            : props.label}
        </TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

/** The app's top-level places. It stays when the thread sidebar collapses. */
export function AppRail() {
  const gt = useGT();
  const navigate = useNavigate();
  const openLayoutPage = useOpenLayoutPage();
  const pathname = useLocation({ select: (location) => location.pathname });
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { setOpen } = useSidebar();
  const pullRequestsSupported = usePullRequestsSupported();
  const issuesSupported = useIssuesSupported();
  const workflowsReachable = useWorkflowEnvironmentIds().length > 0;

  return (
    <TooltipProvider>
      <nav
        aria-label={gt("App")}
        data-app-rail=""
        data-chrome-scope=""
        className="relative z-20 hidden h-svh w-(--app-rail-width) shrink-0 flex-col items-center pb-2 md:flex"
      >
        {/* The rail's share of the window chrome row, which still moves the window. */}
        <div
          aria-hidden
          className="drag-region h-(--workspace-chrome-row-height) w-full shrink-0"
        />
        <SidebarMenu className="items-center">
          <RailItem
            label={gt("Home")}
            active={pathname === "/home"}
            onClick={() => void navigate({ to: "/home" })}
          >
            <HouseIcon className="size-4" />
          </RailItem>
          {/* Shows the thread list; the sidebar's own control and shortcut collapse it. */}
          <RailItem label={gt("Threads")} onClick={() => setOpen(true)}>
            <MessagesSquareIcon className="size-4" />
          </RailItem>
          <RailItem
            label={gt("Brain")}
            shortcut={shortcutLabelForCommand(keybindings, "brain.open")}
            active={pathname === "/brain"}
            onClick={() => void navigate({ to: "/brain" })}
          >
            <BrainIcon className="size-4" />
          </RailItem>
          <RailItem
            label={gt("Mission Control")}
            active={pathname === "/mission-control"}
            onClick={() => void navigate({ to: "/mission-control" })}
          >
            <RadarIcon className="size-4" />
          </RailItem>
          <RailItem
            label={gt("Search")}
            shortcut={shortcutLabelForCommand(keybindings, "commandPalette.toggle")}
            onClick={() => openCommandPalette()}
          >
            <SearchIcon className="size-4" />
          </RailItem>
        </SidebarMenu>
        <div className="min-h-2 flex-1" />
        <SidebarMenu className="items-center">
          {pullRequestsSupported ? (
            <RailItem
              label={gt("Pull requests")}
              onClick={() => void openLayoutPage("pull-requests")}
              onPointerDown={(event) => beginLayoutContentDrag(event, { kind: "pull-requests" })}
            >
              <PullRequestGlyph.pullRequest className="size-4" />
            </RailItem>
          ) : null}
          {issuesSupported ? (
            <RailItem
              label={gt("Issues", { $context: "sidebar link to the list of issues" })}
              onClick={() => void openLayoutPage("issues")}
              onPointerDown={(event) => beginLayoutContentDrag(event, { kind: "issues" })}
            >
              <IssueGlyph.issue className="size-4" />
            </RailItem>
          ) : null}
          {workflowsReachable ? (
            <RailItem
              label={gt("Workflows")}
              onClick={() => void openLayoutPage("workflows")}
              onPointerDown={(event) => beginLayoutContentDrag(event, { kind: "workflows" })}
            >
              <WorkflowIcon className="size-4" />
            </RailItem>
          ) : null}
          <RailItem
            label={gt("Usage")}
            active={pathname === "/usage"}
            onClick={() => void navigate({ to: "/usage" })}
          >
            <ChartNoAxesColumnIcon className="size-4" />
          </RailItem>
          <RailItem
            label={gt("Settings")}
            active={pathname.startsWith("/settings")}
            onClick={() => void navigate({ to: "/settings", search: { pane: undefined } })}
          >
            <SettingsIcon className="size-4" />
          </RailItem>
        </SidebarMenu>
      </nav>
    </TooltipProvider>
  );
}
