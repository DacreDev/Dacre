import { BRAIN_BODY_MAX_CHARS, type BrainEntry, BrainEntryId, ProjectId } from "@dacre/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  brainDraftFrom,
  brainListInput,
  brainSaveInput,
  isSavableBrainDraft,
  scopeFilterProject,
  scopeFilterValue,
} from "./brainPage.logic";

const projectId = ProjectId.make("project:with:colons");

const entry: BrainEntry = {
  id: BrainEntryId.make("entry-1"),
  projectId,
  kind: "decision",
  title: "Ship on Fridays",
  body: "Agreed in planning.",
  source: "agent",
  enabled: true,
  pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("brain list filters", () => {
  it("round-trips each scope through its select value", () => {
    expect(scopeFilterProject("all")).toBeUndefined();
    expect(scopeFilterProject(scopeFilterValue(null))).toBeNull();
    expect(scopeFilterProject(scopeFilterValue(projectId))).toBe(projectId);
  });

  it("sends only the filters that are set", () => {
    expect(brainListInput({ query: "  ", kind: null, scope: "all" })).toEqual({});
    expect(
      brainListInput({
        query: " deploy staging ",
        kind: "decision",
        scope: scopeFilterValue(null),
      }),
    ).toEqual({ query: "deploy staging", kind: "decision", projectId: null });
    expect(brainListInput({ query: "", kind: null, scope: scopeFilterValue(projectId) })).toEqual({
      projectId,
    });
  });

  it("keeps a long query within what the server accepts", () => {
    expect(brainListInput({ query: "x".repeat(500), kind: null, scope: "all" }).query).toHaveLength(
      200,
    );
  });
});

describe("brain drafts", () => {
  it("starts a new entry in the scope being looked at", () => {
    expect(brainDraftFrom(null, projectId)).toEqual({
      projectId,
      kind: "note",
      title: "",
      body: "",
    });
  });

  it("can save only a valid draft that changes something", () => {
    const draft = brainDraftFrom(entry, null);
    expect(draft.projectId).toBe(projectId);
    expect(isSavableBrainDraft(draft, entry)).toBe(false);
    expect(isSavableBrainDraft({ ...draft, title: "New title" }, entry)).toBe(true);
    expect(isSavableBrainDraft({ ...draft, kind: "note" }, entry)).toBe(true);
    expect(isSavableBrainDraft({ ...draft, projectId: null }, entry)).toBe(true);
    expect(isSavableBrainDraft({ ...draft, title: "   " }, entry)).toBe(false);
    expect(isSavableBrainDraft({ ...draft, body: "" }, entry)).toBe(false);
    expect(
      isSavableBrainDraft({ ...draft, body: "x".repeat(BRAIN_BODY_MAX_CHARS + 1) }, entry),
    ).toBe(false);
    expect(
      isSavableBrainDraft({ ...brainDraftFrom(null, null), title: "T", body: "B" }, null),
    ).toBe(true);
  });

  it("does not count surrounding space as a change", () => {
    const draft = brainDraftFrom(entry, null);
    expect(isSavableBrainDraft({ ...draft, title: ` ${entry.title} ` }, entry)).toBe(false);
  });

  it("names the entry it saves, and trims what it sends", () => {
    expect(brainSaveInput({ ...brainDraftFrom(entry, null), title: "  Trimmed  " }, entry)).toEqual(
      {
        id: entry.id,
        projectId,
        kind: "decision",
        title: "Trimmed",
        body: "Agreed in planning.",
      },
    );
    expect(brainSaveInput({ projectId: null, kind: "note", title: "T", body: "B" }, null)).toEqual({
      projectId: null,
      kind: "note",
      title: "T",
      body: "B",
    });
  });
});
