import * as Schema from "effect/Schema";

import { IsoDateTime, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const BRAIN_KINDS = [
  "instruction",
  "convention",
  "architecture",
  "decision",
  "issue",
  "solution",
  "task",
  "note",
] as const;
export const BrainKind = Schema.Literals(BRAIN_KINDS);
export type BrainKind = typeof BrainKind.Type;

export const BrainSource = Schema.Literals(["user", "agent"]);
export type BrainSource = typeof BrainSource.Type;

export const BrainEntryId = TrimmedNonEmptyString.pipe(Schema.brand("BrainEntryId"));
export type BrainEntryId = typeof BrainEntryId.Type;

export const BRAIN_TITLE_MAX_CHARS = 200;
export const BRAIN_BODY_MAX_CHARS = 8_000;
export const BRAIN_QUERY_MAX_CHARS = 200;
/** The list page shows at most this many entries, pinned first, then newest. */
export const BRAIN_LIST_LIMIT = 200;

export const BrainTitle = TrimmedNonEmptyString.check(Schema.isMaxLength(BRAIN_TITLE_MAX_CHARS));
export const BrainBody = TrimmedNonEmptyString.check(Schema.isMaxLength(BRAIN_BODY_MAX_CHARS));

export const BrainEntry = Schema.Struct({
  id: BrainEntryId,
  /** Null applies to every project. */
  projectId: Schema.NullOr(ProjectId),
  kind: BrainKind,
  title: Schema.String,
  body: Schema.String,
  source: BrainSource,
  enabled: Schema.Boolean,
  pinned: Schema.Boolean,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type BrainEntry = typeof BrainEntry.Type;

export const BrainListInput = Schema.Struct({
  query: Schema.optional(Schema.String.check(Schema.isMaxLength(BRAIN_QUERY_MAX_CHARS))),
  kind: Schema.optional(BrainKind),
  /** One project's entries, or `null` for global ones. Omitted lists every scope. */
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
});
export type BrainListInput = typeof BrainListInput.Type;

export const BrainListResult = Schema.Struct({
  entries: Schema.Array(BrainEntry),
  /** Every match, including those past `BRAIN_LIST_LIMIT`. */
  total: Schema.Int,
});
export type BrainListResult = typeof BrainListResult.Type;

export const BrainSaveInput = Schema.Struct({
  /** Omitted creates an entry. */
  id: Schema.optional(BrainEntryId),
  projectId: Schema.NullOr(ProjectId),
  kind: BrainKind,
  title: BrainTitle,
  body: BrainBody,
});
export type BrainSaveInput = typeof BrainSaveInput.Type;

export const BrainSetEnabledInput = Schema.Struct({ id: BrainEntryId, enabled: Schema.Boolean });
export const BrainSetPinnedInput = Schema.Struct({ id: BrainEntryId, pinned: Schema.Boolean });
export const BrainRemoveInput = Schema.Struct({ id: BrainEntryId });

export class BrainCredentialError extends Schema.TaggedError<BrainCredentialError>()(
  "BrainCredentialError",
  { field: Schema.Literals(["title", "body"]) },
) {
  override get message(): string {
    return `The ${this.field} looks like it contains a password, token or private key. Brain does not store secrets, so nothing was saved.`;
  }
}

export class BrainLimitError extends Schema.TaggedError<BrainLimitError>()("BrainLimitError", {
  scope: Schema.Literals(["project", "global"]),
  limit: Schema.Int,
}) {
  override get message(): string {
    const where = this.scope === "global" ? "global Brain" : "Brain for this project";
    return `The ${where} already holds ${this.limit} entries from agents. The user can remove some on the Brain page.`;
  }
}

export class BrainEntryNotFoundError extends Schema.TaggedError<BrainEntryNotFoundError>()(
  "BrainEntryNotFoundError",
  { id: BrainEntryId },
) {
  override get message(): string {
    return "That Brain entry no longer exists.";
  }
}

export class BrainStorageError extends Schema.TaggedError<BrainStorageError>()(
  "BrainStorageError",
  { cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return "Brain could not read or save its entries.";
  }
}
