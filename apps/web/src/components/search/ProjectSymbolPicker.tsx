import { useAtomValue } from "@effect/atom-react";
import type { CodeSymbolKind } from "@dacre/contracts";
import { T, useGT, useMessages } from "gt-react";
import {
  BoxIcon,
  BracesIcon,
  ComponentIcon,
  ListOrderedIcon,
  type LucideIcon,
  PackageIcon,
  ShapesIcon,
  SquareFunctionIcon,
  TypeIcon,
  VariableIcon,
} from "lucide-react";
import { useState } from "react";

import { useActiveProjectTarget, type ActiveProjectTarget } from "~/hooks/useActiveProjectTarget";
import { useRightPanelStore } from "~/rightPanelStore";
import { codeSymbolEnvironment, useProjectSymbols } from "~/state/codeSymbols";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";

import { CommandPaletteContent } from "../CommandPaletteContent";
import { type CommandPaletteActionItem, ITEM_ICON_CLASS } from "../CommandPalette.logic";
import { CommandPaletteResults } from "../CommandPaletteResults";
import { InlineButton } from "../ui/button";
import { Spinner } from "../ui/spinner";
import {
  symbolIndexNotice,
  symbolKindLabel,
  symbolPickerEmptyMessage,
} from "./projectSymbolPicker.logic";

const KIND_ICONS = {
  function: SquareFunctionIcon,
  method: BracesIcon,
  class: BoxIcon,
  interface: ComponentIcon,
  type: TypeIcon,
  enum: ListOrderedIcon,
  constant: VariableIcon,
  module: PackageIcon,
} satisfies Record<CodeSymbolKind, LucideIcon>;

const INPUT_ADDON = { startAddon: <ShapesIcon className="text-icon-muted" /> } as const;

interface ProjectSymbolPickerProps {
  readonly setOpen: (open: boolean) => void;
  /** What Esc does here: "Back" to the palette, or "Close". */
  readonly escapeLabel: string;
}

function OpenProjectSymbolPicker(
  props: ProjectSymbolPickerProps & { target: ActiveProjectTarget },
) {
  const { target } = props;
  const gt = useGT();
  const messages = useMessages();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const [query, setQuery] = useState("");
  const [highlightedItemValue, setHighlightedItemValue] = useState<string | null>(null);
  const result = useProjectSymbols(target, query, messages);
  const rebuild = useAtomCommand(codeSymbolEnvironment.rebuild, { label: "rebuild symbol index" });
  const notice = symbolIndexNotice(result.status, messages);

  const items: CommandPaletteActionItem[] = result.symbols.map((symbol) => {
    const KindIcon = KIND_ICONS[symbol.kind];
    return {
      kind: "action",
      value: `symbol:${symbol.path}:${symbol.line}:${symbol.column}:${symbol.name}`,
      searchTerms: [symbol.name],
      // Spaces between the parts, so a screen reader does not run them together.
      title: (
        <>
          <span className="sr-only">{symbolKindLabel(symbol.kind, messages)} </span>
          {symbol.name}{" "}
          <span className="ms-1 text-caption text-dim-foreground">
            {symbol.container === null ? null : (
              <>
                <span className="me-1">{symbol.container}</span>{" "}
              </>
            )}
            {symbol.path}:{symbol.line}
          </span>
        </>
      ),
      icon: <KindIcon aria-hidden="true" className={ITEM_ICON_CLASS} />,
      run: async () => {
        useRightPanelStore.getState().openFile(target.threadRef, symbol.path, symbol.line);
      },
    };
  });
  // `autoHighlight="always"` highlights the first row without reporting it.
  const activeItemValue = items.some((item) => item.value === highlightedItemValue)
    ? highlightedItemValue
    : (items[0]?.value ?? null);

  return (
    <CommandPaletteContent
      aria-label={gt("Go to symbol in {project}", { project: target.projectName })}
      autoHighlight="always"
      escapeLabel={props.escapeLabel}
      footerActionLabel={gt("Open file")}
      inputProps={{
        ...INPUT_ADDON,
        placeholder: gt("Go to symbol in {project}", { project: target.projectName }),
      }}
      mode="none"
      onItemHighlighted={(value) => {
        setHighlightedItemValue(typeof value === "string" ? value : null);
      }}
      onValueChange={(value) => {
        setHighlightedItemValue(null);
        setQuery(value);
      }}
      panelSize="tall-list"
      testId="project-symbol-picker"
      value={query}
    >
      {notice === null ? null : (
        <div
          aria-live="polite"
          className="flex min-h-9 items-center gap-2 border-b border-divider px-3 text-meta text-dim-foreground"
        >
          {result.status?.state === "indexing" ? <Spinner size="sm" /> : null}
          <span className="min-w-0 flex-1 truncate">{notice}</span>
          {result.status?.state === "ready" ? (
            <InlineButton
              onClick={() => {
                void rebuild({
                  environmentId: target.environmentId,
                  input: { projectId: target.projectId },
                });
              }}
            >
              <T>Rebuild index</T>
            </InlineButton>
          ) : null}
        </div>
      )}
      <CommandPaletteResults
        groups={items.length > 0 ? [{ value: "project-symbols", label: "", items }] : []}
        highlightedItemValue={activeItemValue}
        isActionsOnly={false}
        keybindings={keybindings}
        onExecuteItem={(item) => {
          if (item.kind !== "action") return;
          props.setOpen(false);
          void item.run();
        }}
        emptyStateMessage={symbolPickerEmptyMessage(
          { query, status: result.status, isPending: result.isPending, error: result.error },
          messages,
        )}
      />
    </CommandPaletteContent>
  );
}

export function ProjectSymbolPicker(props: ProjectSymbolPickerProps) {
  const gt = useGT();
  const target = useActiveProjectTarget();
  if (target === null) {
    return (
      <CommandPaletteContent
        aria-label={gt("Go to symbol")}
        escapeLabel={props.escapeLabel}
        footerActionLabel={gt("Open file")}
        inputProps={{ ...INPUT_ADDON, disabled: true, placeholder: gt("Go to symbol") }}
        mode="none"
        testId="project-symbol-picker"
        value=""
      >
        <div className="py-10 text-center text-body text-muted-foreground">
          <T>Open a project to search its symbols.</T>
        </div>
      </CommandPaletteContent>
    );
  }
  return (
    <OpenProjectSymbolPicker
      key={`${target.environmentId}:${target.projectId}`}
      setOpen={props.setOpen}
      escapeLabel={props.escapeLabel}
      target={target}
    />
  );
}
