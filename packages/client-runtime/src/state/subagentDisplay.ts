import type {
  ModelSelection,
  OrchestrationV2TurnItemStatus,
  OrchestrationV2ThreadShell,
  OrchestrationProjectShell,
  ServerProvider,
} from "@dacre/contracts";
import { formatModelSlugName, resolveSelectableModel } from "@dacre/shared/model";
import { fileDisplayName } from "@dacre/shared/path";
import { resolveModelShortName } from "../providerClients.ts";
import { isTerminalSubagentStatus } from "./subagentRuntime.ts";
import { mFallback, msg } from "gt-i18n";
import type { MFunctionType } from "gt-i18n/types";

export function formatSubagentDisplayTitle(title: string): string {
  const displayTitle = title.replace(/^Subagent:\s*/i, "");
  const path = /^\/root\/(?:[^/]+\/)*([^/]+)\/?$/u.exec(displayTitle);
  if (path === null) return displayTitle;

  const name = path[1]!.replace(/[_\s]+/gu, " ").trim();
  return name.replace(/(^|\s)\S/gu, (letter) => letter.toUpperCase()) || displayTitle;
}

export function resolveSubagentMetadata(
  input: {
    readonly model: string | null;
    readonly modelSelection?: Pick<ModelSelection, "model"> | undefined;
    readonly provider?: Pick<ServerProvider, "driver" | "models"> | null | undefined;
    readonly parentThread?:
      | Pick<OrchestrationV2ThreadShell, "projectId" | "worktreePath">
      | null
      | undefined;
    readonly childThread?:
      | Pick<OrchestrationV2ThreadShell, "branch" | "worktreePath">
      | null
      | undefined;
    readonly parentProject?: Pick<OrchestrationProjectShell, "workspaceRoot"> | null | undefined;
    readonly childProject?:
      | Pick<OrchestrationProjectShell, "id" | "title" | "workspaceRoot">
      | null
      | undefined;
  },
  resolve: MFunctionType = mFallback,
) {
  const model = input.model?.trim() || input.modelSelection?.model.trim();
  const slug = input.provider
    ? resolveSelectableModel(input.provider.driver, model, input.provider.models)
    : model;
  const catalogModel = input.provider?.models.find((candidate) => candidate.slug === slug);
  const reportedLabel = catalogModel
    ? (resolveModelShortName(catalogModel, input.provider?.driver) ?? catalogModel.name)
    : model
      ? formatModelSlugName(model)
      : resolve(msg("Not reported"));
  const qualifier = catalogModel?.subProvider?.trim();
  const modelLabel = qualifier
    ? reportedLabel
        .replace(
          new RegExp(
            `^${qualifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s*[.:/-]\\s*|\\s+)`,
            "iu",
          ),
          "",
        )
        .trim() || reportedLabel
    : reportedLabel;
  const parentWorkspace = input.parentThread?.worktreePath ?? input.parentProject?.workspaceRoot;
  const childWorkspace = input.childThread?.worktreePath ?? input.childProject?.workspaceRoot;
  const workspace = [
    ...(input.parentThread &&
    input.childProject &&
    input.childProject.id !== input.parentThread.projectId
      ? [
          {
            label: resolve(msg("Project", { $context: "field label" })),
            value: input.childProject.title,
          },
        ]
      : []),
    ...(parentWorkspace && childWorkspace && parentWorkspace !== childWorkspace
      ? [
          {
            label: input.childThread?.branch
              ? resolve(msg("Branch", { $context: "field label" }))
              : input.childThread?.worktreePath
                ? resolve(msg("Worktree", { $context: "field label" }))
                : resolve(msg("Workspace", { $context: "field label" })),
            value: input.childThread?.branch ?? fileDisplayName(childWorkspace),
          },
        ]
      : []),
  ];
  return { modelLabel, modelSlug: slug ?? model ?? null, workspace };
}

export function subagentDetailPreview(input: {
  readonly status: OrchestrationV2TurnItemStatus;
  readonly result?: string | null | undefined;
  readonly progress?: string | null | undefined;
}): string | null {
  const terminal = isTerminalSubagentStatus(input.status);
  const preferred = terminal ? input.result : input.progress;
  const fallback = terminal ? input.progress : input.result;
  const detail = preferred?.trimStart() || fallback?.trimStart() || "";
  if (detail.length <= 280) return detail.trimEnd().replace(/\s+/gu, " ") || null;
  const whitespace = /\s+/uy;
  let compact = "";
  for (let index = 0; index < detail.length; index += 1) {
    whitespace.lastIndex = index;
    const gap = whitespace.exec(detail);
    if (gap) {
      index += gap[0].length;
      if (index === detail.length) break;
      if (compact.length > 0) compact += " ";
    }
    compact += detail[index];
    if (compact.length > 280) {
      let end = 280;
      const previous = compact.charCodeAt(end - 1);
      const next = compact.charCodeAt(end);
      if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
        end -= 1;
      }
      return `${compact.slice(0, end).trimEnd()}…`;
    }
  }
  return compact || null;
}

// Index after the `)` closing a link target that starts at `at`; targets allow escapes and one level of parens.
function linkTargetEnd(text: string, at: number): number {
  let nested = false;
  for (let index = at; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === "\\") {
      if (index + 1 === text.length || "\n\r\u2028\u2029".includes(text[index + 1]!)) return -1;
      index += 1;
    } else if (char === "(") {
      if (nested) return -1;
      nested = true;
    } else if (char === ")") {
      if (!nested) return index + 1;
      nested = false;
    }
  }
  return -1;
}

// `text.replace(/!?\[([^\]]+)\]\((?:\\.|[^\\()]|\((?:\\.|[^\\()])*\))*\)/g, "$1")` without
// rescanning to the end from every `[`.
function withoutMarkdownLinks(text: string): string {
  let kept = "";
  let from = 0;
  let search = 0;
  for (let open = text.indexOf("["); open !== -1; open = text.indexOf("[", search)) {
    const close = text.indexOf("]", open + 1);
    if (close === -1) break;
    search = close + 1;
    const end = close > open + 1 && text[close + 1] === "(" ? linkTargetEnd(text, close + 2) : -1;
    if (end === -1) continue;
    const start = open > from && text[open - 1] === "!" ? open - 1 : open;
    kept += text.slice(from, start) + text.slice(open + 1, close);
    from = search = end;
  }
  return kept + text.slice(from);
}

export function subagentCardDetail(detail: string | null | undefined): string | null {
  if (!detail || /^Child task ended with status\b/i.test(detail)) return null;
  return (
    withoutMarkdownLinks(detail)
      .replace(/`/g, "")
      .replace(/^[ \t]*[-*][ \t]+/gm, "")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}
