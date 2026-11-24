import {
  BRAIN_BODY_MAX_CHARS,
  BRAIN_QUERY_MAX_CHARS,
  BRAIN_TITLE_MAX_CHARS,
  type BrainEntry,
  type BrainKind,
  type BrainListInput,
  type BrainSaveInput,
  ProjectId,
} from "@dacre/contracts";

/** A scope as a select's value; project ids are prefixed so none can read as `all` or `global`. */
export type BrainScopeFilter = "all" | "global" | `project:${string}`;

const PROJECT_PREFIX = "project:";

export const scopeFilterValue = (projectId: ProjectId | null): BrainScopeFilter =>
  projectId === null ? "global" : `${PROJECT_PREFIX}${projectId}`;

export function scopeFilterProject(value: BrainScopeFilter): ProjectId | null | undefined {
  if (value === "all") return undefined;
  if (value === "global") return null;
  return ProjectId.make(value.slice(PROJECT_PREFIX.length));
}

export function brainListInput(filter: {
  readonly query: string;
  readonly kind: BrainKind | null;
  readonly scope: BrainScopeFilter;
}): BrainListInput {
  const query = filter.query.trim().slice(0, BRAIN_QUERY_MAX_CHARS);
  const projectId = scopeFilterProject(filter.scope);
  return {
    ...(query === "" ? {} : { query }),
    ...(filter.kind === null ? {} : { kind: filter.kind }),
    ...(projectId === undefined ? {} : { projectId }),
  };
}

export interface BrainDraft {
  readonly projectId: ProjectId | null;
  readonly kind: BrainKind;
  readonly title: string;
  readonly body: string;
}

export const brainDraftFrom = (
  entry: BrainEntry | null,
  defaultProjectId: ProjectId | null,
): BrainDraft =>
  entry === null
    ? { projectId: defaultProjectId, kind: "note", title: "", body: "" }
    : { projectId: entry.projectId, kind: entry.kind, title: entry.title, body: entry.body };

export function isSavableBrainDraft(draft: BrainDraft, entry: BrainEntry | null): boolean {
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (title.length === 0 || title.length > BRAIN_TITLE_MAX_CHARS) return false;
  if (body.length === 0 || body.length > BRAIN_BODY_MAX_CHARS) return false;
  return (
    entry === null ||
    title !== entry.title ||
    body !== entry.body ||
    draft.kind !== entry.kind ||
    draft.projectId !== entry.projectId
  );
}

export const brainSaveInput = (draft: BrainDraft, entry: BrainEntry | null): BrainSaveInput => ({
  ...(entry === null ? {} : { id: entry.id }),
  projectId: draft.projectId,
  kind: draft.kind,
  title: draft.title.trim(),
  body: draft.body.trim(),
});
