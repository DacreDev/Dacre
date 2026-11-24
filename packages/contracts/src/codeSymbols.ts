import * as Schema from "effect/Schema";

import { NonNegativeInt, PositiveInt, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const CodeSymbolKind = Schema.Literals([
  "function",
  "class",
  "method",
  "interface",
  "type",
  "enum",
  "constant",
  "module",
]);
export type CodeSymbolKind = typeof CodeSymbolKind.Type;

const CODE_SYMBOL_QUERY_MAX_CHARS = 200;
const CODE_SYMBOL_SEARCH_MAX_LIMIT = 100;

export const CodeSymbol = Schema.Struct({
  name: Schema.String,
  kind: CodeSymbolKind,
  /** Relative to the project folder, with `/` separators. */
  path: Schema.String,
  line: PositiveInt,
  /** In UTF-16 code units, as editors count them. */
  column: PositiveInt,
  /** The enclosing class, interface, enum, type or module, when there is one. */
  container: Schema.NullOr(Schema.String),
});
export type CodeSymbol = typeof CodeSymbol.Type;

export const CodeSymbolIndexStatus = Schema.Struct({
  /** `idle` until the first search asks for the project. */
  state: Schema.Literals(["idle", "indexing", "ready"]),
  /** Progress of the running or last pass, which parses only files that changed. */
  filesDone: NonNegativeInt,
  filesTotal: NonNegativeInt,
  /** Supported source files in the index; 0 when the project has none. */
  indexedFiles: NonNegativeInt,
  lastError: Schema.NullOr(Schema.String),
});
export type CodeSymbolIndexStatus = typeof CodeSymbolIndexStatus.Type;

export const CodeSymbolProjectInput = Schema.Struct({ projectId: ProjectId });
export type CodeSymbolProjectInput = typeof CodeSymbolProjectInput.Type;

export const CodeSymbolSearchInput = Schema.Struct({
  projectId: ProjectId,
  /** Part of a symbol's name, in any case. */
  query: TrimmedNonEmptyString.check(Schema.isMaxLength(CODE_SYMBOL_QUERY_MAX_CHARS)),
  kind: Schema.optional(CodeSymbolKind),
  limit: Schema.optional(
    PositiveInt.check(Schema.isLessThanOrEqualTo(CODE_SYMBOL_SEARCH_MAX_LIMIT)),
  ),
});
export type CodeSymbolSearchInput = typeof CodeSymbolSearchInput.Type;

export const CodeSymbolSearchResult = Schema.Struct({
  symbols: Schema.Array(CodeSymbol),
  status: CodeSymbolIndexStatus,
});
export type CodeSymbolSearchResult = typeof CodeSymbolSearchResult.Type;

export class CodeSymbolProjectNotFoundError extends Schema.TaggedError<CodeSymbolProjectNotFoundError>()(
  "CodeSymbolProjectNotFoundError",
  { projectId: ProjectId },
) {
  override get message(): string {
    return "That project no longer exists.";
  }
}

export class CodeSymbolStorageError extends Schema.TaggedError<CodeSymbolStorageError>()(
  "CodeSymbolStorageError",
  { cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return "The symbol index could not be read or saved.";
  }
}
