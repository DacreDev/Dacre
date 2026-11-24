import type { CustomAgentMode } from "@dacre/contracts";
import { AGENT_MODES, type BuiltInAgentModeId } from "@dacre/shared/agentModes";
import { msg } from "gt-react";
import {
  BlocksIcon,
  BotIcon,
  BoxIcon,
  BugIcon,
  DraftingCompassIcon,
  GaugeIcon,
  ListChecksIcon,
  type LucideIcon,
  MessageCircleQuestionIcon,
  PaletteIcon,
  ScanSearchIcon,
  SplitIcon,
  TelescopeIcon,
} from "lucide-react";

import { m, type MessageResolver } from "~/i18n/messages";

const builtInAgentModeDisplay: Record<
  BuiltInAgentModeId,
  { label: string; description: string; icon: LucideIcon }
> = {
  agent: {
    label: msg("Agent", { $context: "agent mode that works normally" }),
    description: msg("Works on the task with all its tools."),
    icon: BotIcon,
  },
  ask: {
    label: msg("Ask", { $context: "agent mode that only answers questions" }),
    description: msg("Answers from the code without changing it."),
    icon: MessageCircleQuestionIcon,
  },
  plan: {
    label: msg("Plan", { $context: "agent mode that proposes a plan first" }),
    description: msg("Proposes a plan before any change."),
    icon: ListChecksIcon,
  },
  architect: {
    label: msg("Architect", { $context: "agent mode for system design" }),
    description: msg("Weighs structure, risks and trade-offs."),
    icon: DraftingCompassIcon,
  },
  debug: {
    label: msg("Debug", { $context: "agent mode for finding bugs" }),
    description: msg("Finds the root cause, then fixes it."),
    icon: BugIcon,
  },
  review: {
    label: msg("Review", { $context: "agent mode for code review" }),
    description: msg("Reports bugs and risks in the code."),
    icon: ScanSearchIcon,
  },
  parallel: {
    label: msg("Parallel", { $context: "agent mode that splits work across agents" }),
    description: msg("Splits work across concurrent agents."),
    icon: SplitIcon,
  },
  performance: {
    label: msg("Performance", { $context: "agent mode for speed work" }),
    description: msg("Measures, then fixes what is slow."),
    icon: GaugeIcon,
  },
  design: {
    label: msg("UI/UX", { $context: "agent mode for interface design" }),
    description: msg("Focuses on interface quality."),
    icon: PaletteIcon,
  },
  research: {
    label: msg("Research", { $context: "agent mode for research" }),
    description: msg("Researches and cites its sources."),
    icon: TelescopeIcon,
  },
  model3d: {
    label: msg("3D", { $context: "agent mode for 3D assets" }),
    description: msg("Works on 3D assets and scenes."),
    icon: BoxIcon,
  },
};

export const builtInAgentModeIcon = (id: BuiltInAgentModeId): LucideIcon =>
  builtInAgentModeDisplay[id].icon;

export interface AgentModeOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly readOnly: boolean;
  readonly custom: boolean;
}

export function resolveAgentModeOptions(
  customModes: ReadonlyArray<CustomAgentMode>,
  resolve: MessageResolver = m,
): ReadonlyArray<AgentModeOption> {
  return [
    ...AGENT_MODES.map((mode) => {
      const display = builtInAgentModeDisplay[mode.id];
      return {
        id: mode.id,
        label: resolve(display.label),
        description: resolve(display.description),
        icon: display.icon,
        readOnly: mode.readOnly,
        custom: false,
      };
    }),
    ...customModes.map((mode) => ({
      id: mode.id,
      label: mode.name,
      description: mode.instructions.split("\n", 1)[0]!,
      icon: BlocksIcon,
      readOnly: mode.readOnly,
      custom: true,
    })),
  ];
}
