import { T, useGT } from "gt-react";
import { EyeIcon, SettingsIcon } from "lucide-react";
import { memo, useId } from "react";

import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { AgentModeOption } from "./agentModeConfig";
import { ComposerControl, ComposerControlIcon } from "./ComposerControl";
import { useComposerMenuProps } from "./composerEventScope";

function AgentModeRow({ option }: { readonly option: AgentModeOption }) {
  const gt = useGT();
  const descriptionId = useId();
  const Icon = option.icon;
  return (
    <MenuRadioItem
      value={option.id}
      closeOnClick
      label={option.label}
      aria-label={option.readOnly ? gt("{mode}, read-only", { mode: option.label }) : option.label}
      aria-describedby={descriptionId}
    >
      <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="grid min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{option.label}</span>
          {option.readOnly ? (
            <EyeIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" />
          ) : null}
        </span>
        <span id={descriptionId} className="truncate text-meta text-muted-foreground">
          {option.description}
        </span>
      </span>
    </MenuRadioItem>
  );
}

/** How the agent works on this thread. The server enforces read-only modes, not this menu. */
export const ComposerAgentModePicker = memo(function ComposerAgentModePicker(props: {
  readonly options: ReadonlyArray<AgentModeOption>;
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly onManage: () => void;
}) {
  const gt = useGT();
  const menuProps = useComposerMenuProps();
  const selected = props.options.find((option) => option.id === props.value) ?? props.options[0]!;
  const SelectedIcon = selected.icon;
  const builtInModes = props.options.filter((option) => !option.custom);
  const customModes = props.options.filter((option) => option.custom);
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <ComposerControl
                  size="xs"
                  aria-label={gt("Mode: {mode}", { mode: selected.label })}
                />
              }
            />
          }
        >
          <ComposerControlIcon icon={SelectedIcon} size="xs" />
          <span data-composer-control-label>{selected.label}</span>
        </TooltipTrigger>
        <TooltipPopup side="top">
          {selected.readOnly
            ? gt("{mode}. Read-only, enforced by the provider where supported.", {
                mode: selected.label,
              })
            : selected.description}
        </TooltipPopup>
      </Tooltip>
      <MenuPopup align="start" {...menuProps}>
        <MenuRadioGroup
          aria-label={gt("Mode")}
          value={selected.id}
          onValueChange={(value: string) => {
            if (value !== selected.id) props.onChange(value);
          }}
          className="w-80 max-w-full"
        >
          <MenuGroup>
            <MenuGroupLabel>
              <T>Mode</T>
            </MenuGroupLabel>
            {builtInModes.map((option) => (
              <AgentModeRow key={option.id} option={option} />
            ))}
          </MenuGroup>
          {customModes.length > 0 ? (
            <>
              <MenuSeparator />
              <MenuGroup>
                <MenuGroupLabel>
                  <T>Custom modes</T>
                </MenuGroupLabel>
                {customModes.map((option) => (
                  <AgentModeRow key={option.id} option={option} />
                ))}
              </MenuGroup>
            </>
          ) : null}
        </MenuRadioGroup>
        <MenuSeparator />
        <p className="flex w-80 max-w-full items-start gap-2 px-2 py-1 text-meta text-muted-foreground">
          <EyeIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
          <T>Read-only modes are enforced by the provider where supported.</T>
        </p>
        <MenuSeparator />
        <MenuItem onClick={props.onManage}>
          <SettingsIcon aria-hidden className="size-3.5 text-muted-foreground" />
          <T>Manage custom modes</T>
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
});
