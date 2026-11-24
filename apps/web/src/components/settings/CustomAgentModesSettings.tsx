import {
  CUSTOM_AGENT_MODE_INSTRUCTIONS_MAX_LENGTH,
  CUSTOM_AGENT_MODE_NAME_MAX_LENGTH,
  CUSTOM_AGENT_MODES_MAX,
  type CustomAgentMode,
} from "@dacre/contracts";
import { T, useGT } from "gt-react";
import { EyeIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useId, useState } from "react";

import { randomUUID } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Text } from "../ui/text";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SettingsRow } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";

export function replaceCustomAgentMode(
  modes: ReadonlyArray<CustomAgentMode>,
  next: CustomAgentMode,
): ReadonlyArray<CustomAgentMode> {
  return modes.some((mode) => mode.id === next.id)
    ? modes.map((mode) => (mode.id === next.id ? next : mode))
    : [...modes, next];
}

/** Creates, edits and deletes the modes offered in the composer's mode picker. */
export function CustomAgentModesRow() {
  const gt = useGT();
  const searchableSetting = useSearchableSetting();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  // One list is written to every target, so differing environments must not be overwritten.
  const mixed = useScopedSettingsMixed(["customAgentModes"]);
  const [editing, setEditing] = useState<{
    readonly mode: CustomAgentMode;
    readonly isNew: boolean;
  } | null>(null);
  const modes = settings.customAgentModes;
  const atLimit = modes.length >= CUSTOM_AGENT_MODES_MAX;
  return (
    <SettingsRow
      serverScoped
      settingKeys={["customAgentModes"]}
      {...searchableSetting("custom-agent-modes")}
      description={
        mixed
          ? gt("These environments have different custom modes. Select one to edit its modes.")
          : atLimit
            ? gt("You have reached the limit of {count} custom modes.", {
                count: CUSTOM_AGENT_MODES_MAX,
              })
            : gt("Your own modes in the composer. Their instructions go with every turn.")
      }
      control={
        <Button
          size="sm"
          variant="secondary"
          disabled={mixed || atLimit}
          onClick={() =>
            setEditing({
              mode: {
                id: `custom:${randomUUID()}`,
                name: "",
                instructions: "",
                readOnly: false,
              },
              isNew: true,
            })
          }
        >
          <PlusIcon aria-hidden />
          <T>Add mode</T>
        </Button>
      }
    >
      {!mixed && modes.length > 0 ? (
        <ul className="grid gap-1">
          {modes.map((mode) => (
            <li key={mode.id} className="flex min-w-0 items-center gap-3 py-1">
              <span className="grid min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Text variant="label" truncate>
                    {mode.name}
                  </Text>
                  {mode.readOnly ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            role="img"
                            tabIndex={0}
                            aria-label={gt("Read-only")}
                            className="inline-flex shrink-0 text-muted-foreground"
                          />
                        }
                      >
                        <EyeIcon aria-hidden className="size-3" />
                      </TooltipTrigger>
                      <TooltipPopup side="top">
                        <T>Read-only, enforced by the provider where supported.</T>
                      </TooltipPopup>
                    </Tooltip>
                  ) : null}
                </span>
                <Text variant="meta" tone="muted" truncate>
                  {mode.instructions.split("\n", 1)[0]}
                </Text>
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={gt("Edit {mode}", { mode: mode.name })}
                onClick={() => setEditing({ mode, isNew: false })}
              >
                <PencilIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {editing ? (
        <CustomAgentModeDialog
          mode={editing.mode}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={(mode) => {
            updateSettings({ customAgentModes: replaceCustomAgentMode(modes, mode) });
            setEditing(null);
          }}
          onDelete={() => {
            updateSettings({
              customAgentModes: modes.filter((mode) => mode.id !== editing.mode.id),
            });
            setEditing(null);
          }}
        />
      ) : null}
    </SettingsRow>
  );
}

function CustomAgentModeDialog(props: {
  readonly mode: CustomAgentMode;
  readonly isNew: boolean;
  readonly onClose: () => void;
  readonly onSave: (mode: CustomAgentMode) => void;
  readonly onDelete: () => void;
}) {
  const gt = useGT();
  const fieldId = useId();
  const [name, setName] = useState(props.mode.name);
  const [instructions, setInstructions] = useState(props.mode.instructions);
  const [readOnly, setReadOnly] = useState(props.mode.readOnly);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const trimmedName = name.trim();
  const trimmedInstructions = instructions.trim();
  const valid =
    trimmedName.length > 0 &&
    trimmedName.length <= CUSTOM_AGENT_MODE_NAME_MAX_LENGTH &&
    trimmedInstructions.length > 0 &&
    trimmedInstructions.length <= CUSTOM_AGENT_MODE_INSTRUCTIONS_MAX_LENGTH;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogPopup>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            props.onSave({
              id: props.mode.id,
              name: trimmedName,
              instructions: trimmedInstructions,
              readOnly,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{props.isNew ? gt("Add mode") : gt("Edit mode")}</DialogTitle>
            <DialogDescription>
              <T>The instructions are added to every message you send in this mode.</T>
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-name`}>
                <T>Name</T>
              </Label>
              <Input
                id={`${fieldId}-name`}
                autoFocus
                required
                maxLength={CUSTOM_AGENT_MODE_NAME_MAX_LENGTH}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-instructions`}>
                <T>Instructions</T>
              </Label>
              <Textarea
                id={`${fieldId}-instructions`}
                required
                rows={6}
                maxLength={CUSTOM_AGENT_MODE_INSTRUCTIONS_MAX_LENGTH}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="grid gap-0.5">
                <Label htmlFor={`${fieldId}-read-only`}>
                  <T>Read-only</T>
                </Label>
                <Text variant="meta" tone="muted">
                  <T>Enforced by the provider where supported.</T>
                </Text>
              </span>
              <Switch
                id={`${fieldId}-read-only`}
                checked={readOnly}
                onCheckedChange={(checked) => setReadOnly(Boolean(checked))}
                aria-label={gt("Read-only")}
              />
            </div>
          </DialogPanel>
          <DialogFooter>
            {props.isNew ? null : (
              <Button
                type="button"
                variant="destructive-outline"
                className="sm:me-auto"
                onClick={() => (confirmingDelete ? props.onDelete() : setConfirmingDelete(true))}
              >
                {confirmingDelete ? gt("Confirm delete") : gt("Delete")}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={props.onClose}>
              <T>Cancel</T>
            </Button>
            <Button type="submit" disabled={!valid}>
              <T>Save mode</T>
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
