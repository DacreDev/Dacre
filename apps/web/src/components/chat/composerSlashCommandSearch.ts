import {
  insertRankedSearchResult,
  normalizeSearchQuery,
  scoreQueryMatch,
} from "@dacre/shared/searchRanking";

import type { ComposerCommandItem } from "./ComposerCommandMenu";
import { AGENT_MODE_SLASH_COMMANDS, isAgentModeSlashCommand } from "../../composer-logic";
import { scoreProviderSkill } from "../../providerSkillSearch";

type SlashSearchItem = Extract<
  ComposerCommandItem,
  { type: "slash-command" | "provider-slash-command" | "skill" }
>;

/** One command per offered mode; a provider command with the same name keeps its meaning. */
export function agentModeSlashCommandItems(
  modes: ReadonlyArray<{ readonly id: string; readonly label: string }>,
  providerCommandNames: ReadonlySet<string>,
  describe: (modeLabel: string) => string,
): Array<Extract<SlashSearchItem, { type: "slash-command" }>> {
  return Object.keys(AGENT_MODE_SLASH_COMMANDS)
    .filter(isAgentModeSlashCommand)
    .flatMap((command) => {
      const mode = modes.find((option) => option.id === AGENT_MODE_SLASH_COMMANDS[command]);
      if (mode === undefined || providerCommandNames.has(command)) return [];
      return [
        {
          id: `slash:${command}`,
          type: "slash-command" as const,
          command,
          label: `/${command}`,
          description: describe(mode.label),
        },
      ];
    });
}

/** Provider commands, `/side`, `/btw` and `/clear` work only at the message start. */
export function slashCommandItemsForPromptPosition(
  items: ReadonlyArray<SlashSearchItem>,
  isAtPromptStart: boolean,
): SlashSearchItem[] {
  if (isAtPromptStart) {
    return [...items];
  }
  return items.filter(
    (item) =>
      item.type === "skill" ||
      (item.type === "slash-command" &&
        item.command !== "side" &&
        item.command !== "btw" &&
        item.command !== "clear"),
  );
}

function scoreSlashCommandItem(item: SlashSearchItem, query: string): number | null {
  if (item.type === "skill") {
    if (query === "skill") {
      return 0;
    }
    const skillQuery = query.startsWith("skill:") ? query.slice("skill:".length) : query;
    const skillScore = skillQuery ? scoreProviderSkill(item.skill, skillQuery) : 0;
    if (skillScore !== null) {
      return skillScore;
    }
    return "skill".startsWith(query) ? Number.MAX_SAFE_INTEGER : null;
  }

  const primaryValue =
    item.type === "slash-command" ? item.command.toLowerCase() : item.command.name.toLowerCase();
  const description = item.description.toLowerCase();

  const scores = [
    scoreQueryMatch({
      value: primaryValue,
      query,
      exactBase: 0,
      prefixBase: 2,
      boundaryBase: 4,
      includesBase: 6,
      fuzzyBase: 100,
      boundaryMarkers: ["-", "_", "/"],
    }),
    scoreQueryMatch({
      value: description,
      query,
      exactBase: 20,
      prefixBase: 22,
      boundaryBase: 24,
      includesBase: 26,
    }),
  ].filter((score): score is number => score !== null);

  if (scores.length === 0) {
    return null;
  }

  return Math.min(...scores);
}

export function searchSlashCommandItems(
  items: ReadonlyArray<SlashSearchItem>,
  query: string,
): SlashSearchItem[] {
  const normalizedQuery = normalizeSearchQuery(query, { trimLeadingPattern: /^\/+/ });
  if (!normalizedQuery) {
    return [...items];
  }

  const ranked: Array<{
    item: SlashSearchItem;
    score: number;
    tieBreaker: string;
  }> = [];

  for (const item of items) {
    const score = scoreSlashCommandItem(item, normalizedQuery);
    if (score === null) {
      continue;
    }

    insertRankedSearchResult(
      ranked,
      {
        item,
        score,
        tieBreaker:
          item.type === "slash-command"
            ? `0\u0000${item.command}`
            : item.type === "provider-slash-command"
              ? `1\u0000${item.command.name}\u0000${item.provider}`
              : `2\u0000${item.skill.name}\u0000${item.provider}`,
      },
      Number.POSITIVE_INFINITY,
    );
  }

  return ranked.map((entry) => entry.item);
}
