import type { CodeSymbolIndexStatus, CodeSymbolKind } from "@dacre/contracts";
import { msg } from "gt-react";

import { m, type MessageResolver } from "~/i18n/messages";

const KIND_LABELS = {
  function: msg("Function", { $context: "kind of code symbol" }),
  method: msg("Method", { $context: "kind of code symbol" }),
  class: msg("Class", { $context: "kind of code symbol" }),
  interface: msg("Interface", { $context: "kind of code symbol" }),
  type: msg("Type", { $context: "kind of code symbol" }),
  enum: msg("Enum", { $context: "kind of code symbol" }),
  constant: msg("Constant", { $context: "kind of code symbol" }),
  module: msg("Module", { $context: "kind of code symbol, a namespace or package" }),
} satisfies Record<CodeSymbolKind, string>;

export const symbolKindLabel = (kind: CodeSymbolKind, resolve: MessageResolver = m) =>
  resolve(KIND_LABELS[kind]);

/**
 * The line above the results while a first index or a rebuild runs, or after one failed. The quick
 * refreshes that follow searches stay quiet.
 */
export function symbolIndexNotice(
  status: CodeSymbolIndexStatus | null,
  resolve: MessageResolver = m,
): string | null {
  if (status?.state === "indexing" && status.indexedFiles === 0) {
    return status.filesTotal === 0
      ? resolve(msg("Indexing symbols…"))
      : resolve(
          msg("Indexing symbols in {done} of {total} files…", {
            done: status.filesDone.toLocaleString(),
            total: status.filesTotal.toLocaleString(),
          }),
        );
  }
  return status?.lastError
    ? resolve(msg("The symbol index could not be built: {error}", { error: status.lastError }))
    : null;
}

/** What the list says when it shows no symbols. */
export function symbolPickerEmptyMessage(
  input: {
    readonly query: string;
    readonly status: CodeSymbolIndexStatus | null;
    readonly isPending: boolean;
    readonly error: string | null;
  },
  resolve: MessageResolver = m,
): string {
  if (input.error !== null) return input.error;
  const { status } = input;
  if (status?.state === "ready" && status.indexedFiles === 0 && status.lastError === null) {
    return resolve(
      msg(
        "This project has no TypeScript, JavaScript, Python, Go, Rust, Java or C# files to search.",
      ),
    );
  }
  if (input.query.trim() === "")
    return resolve(msg("Type part of a function, class or type name."));
  if (input.isPending) return resolve(msg("Searching symbols…"));
  return input.status?.state === "indexing"
    ? resolve(msg("No matching symbols yet."))
    : resolve(msg("No matching symbols."));
}
