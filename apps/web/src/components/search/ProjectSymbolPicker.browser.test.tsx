import {
  type CodeSymbol,
  type CodeSymbolIndexStatus,
  EnvironmentId,
  ProjectId,
  ThreadId,
} from "@dacre/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { openCommandPalette } from "../../commandPaletteBus";
import { useCommandPaletteStore } from "../../commandPaletteStore";
import { useRightPanelStore } from "../../rightPanelStore";
import { CommandPalette } from "../CommandPalette";

const threadRef = {
  environmentId: EnvironmentId.make("local"),
  threadId: ThreadId.make("thread"),
};

const ready: CodeSymbolIndexStatus = {
  state: "ready",
  filesDone: 0,
  filesTotal: 0,
  indexedFiles: 2,
  lastError: null,
};

const index = vi.hoisted(() => ({
  symbols: [] as ReadonlyArray<CodeSymbol>,
  status: null as CodeSymbolIndexStatus | null,
  queries: [] as Array<string>,
}));

vi.mock("~/hooks/useActiveProjectTarget", () => ({
  useActiveProjectTarget: () => ({
    environmentId: threadRef.environmentId,
    projectId: ProjectId.make("project"),
    cwd: "/workspace",
    projectName: "shapes",
    threadRef,
  }),
}));
vi.mock("~/state/codeSymbols", async (original) => ({
  ...(await original<typeof import("~/state/codeSymbols")>()),
  useProjectSymbols: (_target: unknown, query: string) => {
    index.queries.push(query);
    return {
      symbols: query.trim() === "" ? [] : index.symbols,
      status: index.status,
      error: null,
      isPending: false,
    };
  },
}));

function setup(state: {
  readonly symbols?: ReadonlyArray<CodeSymbol>;
  readonly status: CodeSymbolIndexStatus;
}) {
  useCommandPaletteStore.setState(useCommandPaletteStore.getInitialState(), true);
  index.symbols = state.symbols ?? [];
  index.status = state.status;
  index.queries = [];
}

it("opens Go to symbol from the palette and the chosen definition at its line", async () => {
  setup({
    status: ready,
    symbols: [
      {
        name: "Circle",
        kind: "class",
        path: "src/shapes.ts",
        line: 11,
        column: 14,
        container: null,
      },
      {
        name: "area",
        kind: "method",
        path: "src/shapes.ts",
        line: 15,
        column: 3,
        container: "Circle",
      },
    ],
  });
  using openFile = vi.spyOn(useRightPanelStore.getState(), "openFile").mockImplementation(() => {});
  await using _screen = await render(<CommandPalette>{null}</CommandPalette>);

  openCommandPalette({ query: "Go to symbol" });
  await userEvent.keyboard("{Enter}");
  const input = page.getByRole("combobox", { name: /go to symbol in shapes/i });
  await expect.element(input).toHaveFocus();
  await expect
    .element(page.getByText("Type part of a function, class or type name."))
    .toBeVisible();

  await input.fill("ci");
  // The kind is read out before the name, and the parts stay apart.
  await expect
    .element(page.getByRole("option", { name: /^Class Circle src\/shapes\.ts:11$/ }))
    .toBeVisible();
  await expect
    .element(page.getByRole("option", { name: /^Method area Circle src\/shapes\.ts:15$/ }))
    .toBeVisible();
  expect(index.queries).toContain("ci");

  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(openFile).toHaveBeenCalledExactlyOnceWith(threadRef, "src/shapes.ts", 15);
  expect(useCommandPaletteStore.getState().open).toBe(false);
});

it("shows the first index's progress, then says when a project has nothing to index", async () => {
  setup({
    status: { ...ready, state: "indexing", filesDone: 1200, filesTotal: 7764, indexedFiles: 0 },
  });
  await using screen = await render(<CommandPalette>{null}</CommandPalette>);
  openCommandPalette({ query: "Go to symbol" });
  await userEvent.keyboard("{Enter}");
  await page.getByRole("combobox").fill("parse");
  await expect.element(page.getByText("Indexing symbols in 1,200 of 7,764 files…")).toBeVisible();
  await expect.element(page.getByText("No matching symbols yet.")).toBeVisible();

  index.status = { ...ready, indexedFiles: 0 };
  await screen.rerender(<CommandPalette>{null}</CommandPalette>);
  await page.getByRole("combobox").fill("parser");
  await expect
    .element(
      page.getByText(
        "This project has no TypeScript, JavaScript, Python, Go, Rust, Java or C# files to search.",
      ),
    )
    .toBeVisible();
  await expect.element(page.getByText(/Indexing symbols/)).not.toBeInTheDocument();
});
