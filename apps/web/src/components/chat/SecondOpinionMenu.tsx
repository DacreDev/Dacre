import { resolveProvidersForCwd } from "@dacre/client-runtime/providerSkills";
import type { ServerProvider } from "@dacre/contracts";
import { T, useGT } from "gt-react";
import { ScanSearchIcon } from "lucide-react";
import { use } from "react";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import {
  getDefaultProviderInstanceModel,
  providerInstanceEntriesFor,
} from "../../providerInstances";
import { useEnvironmentProviders } from "../../state/environments";
import type { Thread, TurnDiffSummary } from "../../types";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemDetail,
  MenuItemLabel,
  MenuPopup,
  MenuTrigger,
} from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { secondOpinionPrompt, secondOpinionProviders } from "./secondOpinion.logic";
import {
  type TimelineRowSharedState,
  TimelineRowActivityCtx,
  TimelineRowCtx,
} from "./timelineRowContext";

const NO_PROVIDERS: ReadonlyArray<ServerProvider> = [];

/** "Second opinion" on the latest turn's changed files; earlier turns offer none. */
export function SecondOpinionAction(props: {
  readonly turn: TurnDiffSummary;
  readonly thread: Thread | null;
}) {
  const { onSecondOpinion } = use(TimelineRowCtx);
  const { isWorking, latestRunId } = use(TimelineRowActivityCtx);
  if (onSecondOpinion === undefined || props.turn.runId !== latestRunId) return null;
  return (
    <SecondOpinionMenu
      turn={props.turn}
      thread={props.thread}
      running={isWorking}
      onStart={onSecondOpinion}
    />
  );
}

function SecondOpinionMenu(props: {
  readonly turn: TurnDiffSummary;
  readonly thread: Thread | null;
  readonly running: boolean;
  readonly onStart: NonNullable<TimelineRowSharedState["onSecondOpinion"]>;
}) {
  const ctx = use(TimelineRowCtx);
  const gt = useGT();
  const settings = useEnvironmentSettings(ctx.activeThreadEnvironmentId);
  const providersByEnvironment = useEnvironmentProviders();
  const providers = resolveProvidersForCwd(
    providersByEnvironment.get(ctx.activeThreadEnvironmentId) ?? NO_PROVIDERS,
    ctx.markdownCwd,
  );
  const threadInstanceId = props.thread?.modelSelection.instanceId;
  const entries = secondOpinionProviders(
    providerInstanceEntriesFor(providers, settings, props.thread?.projectId ?? null),
    threadInstanceId,
  );
  const disabledReason =
    ctx.secondOpinionDisabledReason ??
    (props.running
      ? gt("Available when the turn finishes.")
      : entries.length === 0
        ? gt("No provider is ready to review.")
        : null);
  const button = (
    <Button
      size="xs"
      variant="secondary"
      aria-label={gt("Second opinion")}
      aria-disabled={disabledReason !== null || undefined}
    />
  );

  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger render={disabledReason === null ? <MenuTrigger render={button} /> : button}>
          <ScanSearchIcon className="size-3" />
          <span className="hidden @[32rem]/changed-files:inline">
            <T>Second opinion</T>
          </span>
        </TooltipTrigger>
        <TooltipPopup side="top">
          <T>Second opinion</T>
          <span className="block">
            {disabledReason ?? gt("Ask another agent to review this turn's changes.")}
          </span>
        </TooltipPopup>
      </Tooltip>
      {disabledReason === null ? (
        <MenuPopup align="end">
          <MenuGroup>
            <MenuGroupLabel>
              <T>Review with</T>
            </MenuGroupLabel>
            {entries.map((entry) => (
              <MenuItem
                key={entry.instanceId}
                onClick={() => {
                  const model = getDefaultProviderInstanceModel(providers, entry.instanceId);
                  if (model === undefined) return;
                  void props.onStart({
                    modelSelection: { instanceId: entry.instanceId, model },
                    text: secondOpinionPrompt(props.turn),
                  });
                }}
              >
                <ProviderInstanceIcon
                  driverKind={entry.driverKind}
                  displayName={entry.displayName}
                  accentColor={entry.accentColor}
                  acpRegistryAgentId={entry.acpRegistryAgentId}
                  acpRegistryIconUrl={entry.acpRegistryIconUrl}
                  size="compact"
                />
                <MenuItemLabel>{entry.displayName}</MenuItemLabel>
                {entry.instanceId === threadInstanceId ? (
                  <MenuItemDetail>
                    {gt("This thread", { $context: "marks the provider this thread runs on" })}
                  </MenuItemDetail>
                ) : null}
              </MenuItem>
            ))}
          </MenuGroup>
        </MenuPopup>
      ) : null}
    </Menu>
  );
}
