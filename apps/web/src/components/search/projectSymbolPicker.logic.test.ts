import type { CodeSymbolIndexStatus } from "@dacre/contracts";
import { describe, expect, it } from "vite-plus/test";

import { symbolIndexNotice, symbolPickerEmptyMessage } from "./projectSymbolPicker.logic";

const ready: CodeSymbolIndexStatus = {
  state: "ready",
  filesDone: 0,
  filesTotal: 0,
  indexedFiles: 40,
  lastError: null,
};

describe("symbol picker copy", () => {
  it.each([
    [ready, null],
    [{ ...ready, state: "indexing", indexedFiles: 0 }, "Indexing symbols…"],
    [
      { ...ready, state: "indexing", filesDone: 1200, filesTotal: 7764, indexedFiles: 0 },
      "Indexing symbols in 1,200 of 7,764 files…",
    ],
    // A refresh of an index that already answers searches.
    [{ ...ready, state: "indexing", filesTotal: 3 }, null],
    [
      { ...ready, lastError: "The symbol parser stopped." },
      "The symbol index could not be built: The symbol parser stopped.",
    ],
  ] satisfies ReadonlyArray<[CodeSymbolIndexStatus, string | null]>)(
    "says what the index is doing",
    (status, notice) => {
      expect(symbolIndexNotice(status)).toBe(notice);
    },
  );

  it("tells a project without supported files apart from a search that found nothing", () => {
    const empty = { query: "parse", status: ready, isPending: false, error: null };
    expect(symbolPickerEmptyMessage(empty)).toBe("No matching symbols.");
    expect(symbolPickerEmptyMessage({ ...empty, status: { ...ready, indexedFiles: 0 } })).toBe(
      "This project has no TypeScript, JavaScript, Python, Go, Rust, Java or C# files to search.",
    );
    // A build that failed has not shown the project to be empty.
    const failed = { ...ready, indexedFiles: 0, lastError: "The symbol parser stopped." };
    expect(symbolPickerEmptyMessage({ ...empty, status: failed })).toBe("No matching symbols.");
    expect(symbolPickerEmptyMessage({ ...empty, status: { ...ready, state: "indexing" } })).toBe(
      "No matching symbols yet.",
    );
    expect(symbolPickerEmptyMessage({ ...empty, query: " " })).toBe(
      "Type part of a function, class or type name.",
    );
  });
});
