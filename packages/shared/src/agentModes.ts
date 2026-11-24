import type {
  CustomAgentMode,
  OrchestrationV2ThreadShell,
  ProviderInteractionMode,
} from "@dacre/contracts";

export const DEFAULT_AGENT_MODE_ID = "agent";

export interface AgentMode {
  readonly id: string;
  readonly label: string;
  /** The server runs these turns in the provider's strongest native read-only mode. */
  readonly readOnly: boolean;
  /** Sent with every turn so it survives compaction and mode switches. */
  readonly instructions?: string;
}

export const AGENT_MODES = [
  { id: DEFAULT_AGENT_MODE_ID, label: "Agent", readOnly: false },
  {
    id: "ask",
    label: "Ask",
    readOnly: true,
    instructions:
      "Answer the user's question from the code and context. Do not change files or run commands that change state. Keep the answer direct, cite file paths and lines, and do not write an implementation plan unless asked.",
  },
  // The provider's native plan mode supplies its instructions.
  { id: "plan", label: "Plan", readOnly: true },
  {
    id: "architect",
    label: "Architect",
    readOnly: true,
    instructions:
      "Analyze the system's structure, dependencies, data flow, failure modes and scaling limits before answering. Do not change files. Give a recommendation with its trade-offs, the alternatives you rejected, and the files that would change.",
  },
  {
    id: "debug",
    label: "Debug",
    readOnly: false,
    instructions:
      "Find the root cause before changing code. Reproduce the failure, read the logs and stack traces, and test one hypothesis at a time. Fix the cause with the smallest change, add a regression test when the project has tests, and state what you verified.",
  },
  {
    id: "review",
    label: "Review",
    readOnly: true,
    instructions:
      "Review the code for bugs, regressions, security issues and maintainability problems. Do not change files. Report findings most severe first, each with file and line, the concrete failure, and a suggested fix. Say plainly when you find nothing.",
  },
  {
    id: "parallel",
    label: "Parallel",
    readOnly: false,
    instructions:
      'Split this work into independent tasks. Use `delegate_task` with `isolation: "worktree"` for each task that changes code, and keep tasks from editing the same files. Run them concurrently, then integrate the results, resolve conflicts, and verify the combined change. Do the work yourself when it is too small to split.',
  },
  {
    id: "performance",
    label: "Performance",
    readOnly: false,
    instructions:
      "Measure before changing anything. Profile to find the real bottleneck, change one thing at a time, and re-measure the same way. Report before and after numbers, and revert changes that do not measurably help.",
  },
  {
    id: "design",
    label: "UI/UX",
    readOnly: false,
    instructions:
      "Focus on frontend quality: visual hierarchy, spacing, typography, interaction states, responsive behavior and accessibility (contrast, focus, keyboard, reduced motion). Follow the project's design system. Check the rendered result rather than trusting the code.",
  },
  {
    id: "research",
    label: "Research",
    readOnly: true,
    instructions:
      "Research the question and report what you found. Do not change project files. Prefer primary sources, cite every claim with a link or file path, separate facts from inference, and note conflicting evidence. Save durable findings with `brain_remember` when that tool is available.",
  },
  {
    id: "model3d",
    label: "3D",
    readOnly: false,
    instructions:
      "Work on 3D assets and scenes. Use connected 3D tools such as Blender through MCP when they are available; otherwise write scripts or files the user can run. Check scale, pivots, normals, topology and materials, inspect renders before calling a model done, and keep exported files in common formats such as GLB, FBX or OBJ.",
  },
] as const satisfies ReadonlyArray<AgentMode>;

export type BuiltInAgentModeId = (typeof AGENT_MODES)[number]["id"];

const customAgentMode = (mode: CustomAgentMode): AgentMode => ({
  id: mode.id,
  label: mode.name,
  readOnly: mode.readOnly,
  instructions: mode.instructions,
});

/** An unknown or deleted mode resolves to Agent. */
export function resolveAgentMode(
  id: string | null | undefined,
  customModes: ReadonlyArray<CustomAgentMode>,
): AgentMode {
  const custom = customModes.find((mode) => mode.id === id);
  return custom
    ? customAgentMode(custom)
    : (AGENT_MODES.find((mode) => mode.id === id) ?? AGENT_MODES[0]);
}

/** The mode after `currentId` in the offered list; an unlisted mode restarts from its top. */
export function nextAgentModeId(
  currentId: string,
  modes: ReadonlyArray<{ readonly id: string }>,
): string {
  const index = modes.findIndex((mode) => mode.id === currentId);
  return modes[(index + 1) % modes.length]?.id ?? currentId;
}

/** Read-only modes are stored as Plan so the MCP tools' mode limits apply to what they start. */
export function storedInteractionModeForAgentMode(mode: AgentMode): ProviderInteractionMode {
  return mode.readOnly ? "plan" : "default";
}

/** The thread fields a send sets when it creates the thread. Agent adds nothing to the wire. */
export function agentModeThreadFields(mode: AgentMode) {
  return {
    interactionMode: storedInteractionModeForAgentMode(mode),
    ...(mode.id === DEFAULT_AGENT_MODE_ID ? {} : { agentMode: mode.id }),
  };
}

/** A thread on Agent can still be in Plan, set through MCP or a scheduled task. */
export function agentModeIdForThread(
  thread: Pick<OrchestrationV2ThreadShell, "agentMode" | "interactionMode">,
): string {
  const stored = thread.agentMode ?? DEFAULT_AGENT_MODE_ID;
  return stored === DEFAULT_AGENT_MODE_ID && thread.interactionMode === "plan" ? "plan" : stored;
}

/** Empty text stays empty: a resume relies on it to send no new prompt. */
export function withAgentModeInstructions(text: string, mode: AgentMode): string {
  return mode.instructions === undefined || text === ""
    ? text
    : `${text}\n\n<dacre_mode>\n${mode.instructions}\n</dacre_mode>`;
}
