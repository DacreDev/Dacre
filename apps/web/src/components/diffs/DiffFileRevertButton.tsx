import { useAtomValue } from "@effect/atom-react";
import { errorDisplayMessage } from "@dacre/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@dacre/client-runtime/state/runtime";
import type { EnvironmentId, ThreadId } from "@dacre/contracts";
import { useGT, useMessages } from "gt-react";
import { Undo2Icon } from "lucide-react";
import { useState } from "react";

import { requestConfirmDialog } from "~/confirmDialog";
import { orchestrationEnvironment } from "~/state/orchestration";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** Puts one file of a turn range's diff back as the range found it, once the user confirms. */
export function DiffFileRevertButton(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly fromTurnCount: number;
  readonly toTurnCount: number;
  /** The file as the panel names it. */
  readonly filePath: string;
  /** Set when the file is a tracked repository's own. */
  readonly repositoryPath: string | null;
  /** As that diff names them; a rename is its two paths. */
  readonly paths: ReadonlyArray<string>;
  readonly onReverted: () => void;
}) {
  const gt = useGT();
  const messages = useMessages();
  const command = orchestrationEnvironment.revertTurnDiffFiles;
  const allowed = useAtomValue(command.permissionAtom(props.environmentId));
  const revert = useAtomCommand(command, { reportFailure: false });
  const [pending, setPending] = useState(false);
  if (!allowed) return null;

  const name = props.filePath.split("/").at(-1) ?? props.filePath;
  const confirmAndRevert = async () => {
    setPending(true);
    const confirmed = await (requestConfirmDialog(
      gt(
        "{path} goes back to how it was before turn {turn}. Every later change to it is discarded, including your own edits.",
        { path: props.filePath, turn: props.fromTurnCount + 1 },
      ),
      {
        variant: "destructive",
        title: gt("Revert {name}?", { name }),
        confirmLabel: gt("Revert file"),
      },
    ) ?? Promise.resolve(false));
    if (!confirmed) return setPending(false);
    const result = await revert({
      environmentId: props.environmentId,
      input: {
        threadId: props.threadId,
        fromTurnCount: props.fromTurnCount,
        toTurnCount: props.toTurnCount,
        ...(props.repositoryPath === null ? {} : { repositoryPath: props.repositoryPath }),
        paths: props.paths,
      },
    });
    setPending(false);
    if (result._tag === "Success") {
      toastManager.add({ type: "success", title: gt("Reverted {name}", { name }) });
      props.onReverted();
    } else if (!isAtomCommandInterrupted(result)) {
      const reason = errorDisplayMessage(squashAtomCommandFailure(result), messages);
      toastManager.add({
        type: "error",
        title: gt("Couldn't revert {name}", { name }),
        ...(reason === null ? {} : { description: reason }),
      });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-micro"
            variant="ghost-muted"
            aria-label={gt("Revert {path}", { path: props.filePath })}
            disabled={pending}
            onClick={() => void confirmAndRevert()}
          />
        }
      >
        <Undo2Icon className="size-3" />
      </TooltipTrigger>
      <TooltipPopup>{gt("Revert file")}</TooltipPopup>
    </Tooltip>
  );
}
