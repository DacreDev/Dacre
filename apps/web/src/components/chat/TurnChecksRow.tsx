import type {
  CheckKind,
  CheckOutcome,
  TurnChecks,
} from "@dacre/client-runtime/work-log/turn-checks";
import { msg, useGT, useMessages } from "gt-react";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleSlashIcon,
  CircleXIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const CHECK_LABELS = {
  test: {
    passed: msg("Tests passed"),
    failed: msg("Tests failed"),
    running: msg("Tests running"),
    unknown: msg("Tests ran"),
  },
  lint: {
    passed: msg("Lint passed"),
    failed: msg("Lint failed"),
    running: msg("Lint running"),
    unknown: msg("Lint ran"),
  },
  typecheck: {
    passed: msg("Typecheck passed"),
    failed: msg("Typecheck failed"),
    running: msg("Typecheck running"),
    unknown: msg("Typecheck ran"),
  },
  build: {
    passed: msg("Build passed"),
    failed: msg("Build failed"),
    running: msg("Build running"),
    unknown: msg("Build ran"),
  },
} satisfies Record<CheckKind, Record<CheckOutcome, string>>;

const OUTCOME_LOOK = {
  passed: { Icon: CircleCheckIcon, tone: "text-success-foreground" },
  failed: { Icon: CircleXIcon, tone: "text-destructive-foreground" },
  running: { Icon: CircleDotIcon, tone: "text-muted-foreground" },
  unknown: { Icon: CircleDashedIcon, tone: "text-muted-foreground" },
} satisfies Record<CheckOutcome, { Icon: LucideIcon; tone: string }>;

/** What a finished turn verified, read from the commands it ran rather than from its reply. */
export function TurnChecksRow({ checks }: { checks: TurnChecks }) {
  const gt = useGT();
  const messages = useMessages();
  return (
    <div
      role="group"
      aria-label={gt("Checks", { $context: "noun, the tests, lint and builds an agent ran" })}
      className="flex flex-wrap items-center gap-x-2 pt-1.5"
    >
      {checks.checks.map(({ kind, outcome, commands }) => (
        <CheckChip
          key={kind}
          Icon={OUTCOME_LOOK[outcome].Icon}
          tone={OUTCOME_LOOK[outcome].tone}
          tooltip={commands.map((command) => (
            <div key={command} className="truncate">
              {command}
            </div>
          ))}
          code
        >
          {messages(CHECK_LABELS[kind][outcome])}
        </CheckChip>
      ))}
      {checks.untested ? (
        <CheckChip
          Icon={CircleSlashIcon}
          tone="text-muted-foreground"
          tooltip={gt("This turn changed code without running a test command.")}
        >
          {gt("No tests run")}
        </CheckChip>
      ) : null}
    </div>
  );
}

function CheckChip({
  Icon,
  tone,
  tooltip,
  code = false,
  children,
}: {
  Icon: LucideIcon;
  tone: string;
  tooltip: ReactNode;
  code?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className={cn(
              "inline-flex items-center gap-1 rounded-row px-1 py-0.5 text-meta outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
              tone,
            )}
          />
        }
      >
        <Icon aria-hidden className="size-3 shrink-0" />
        {children}
      </TooltipTrigger>
      <TooltipPopup variant={code ? "code" : "default"}>{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
