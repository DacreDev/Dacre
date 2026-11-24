import {
  type BrainEntry,
  BrainCredentialError,
  BrainEntryId,
  EnvironmentId,
  ProjectId,
} from "@dacre/contracts";
import { Atom } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";
import { ConfirmDialogHost } from "../ConfirmDialogHost";
import { BrainPage } from "./BrainPage";

const environmentId = EnvironmentId.make("laptop");
const projectId = ProjectId.make("project-app");

const entry = (id: string, overrides: Partial<BrainEntry> = {}): BrainEntry => ({
  id: BrainEntryId.make(id),
  projectId,
  kind: "convention",
  title: `Entry ${id}`,
  body: `Body of ${id}`,
  source: "user",
  enabled: true,
  pinned: false,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

const success = <A,>(value: A) => Promise.resolve({ _tag: "Success" as const, value });

const state = vi.hoisted(() => ({
  entries: [] as Array<unknown>,
  total: null as number | null,
  result: null as { entries: Array<unknown>; total: number } | null,
  loading: false,
  error: null as string | null,
  canEdit: true,
  connected: true,
  liveInputs: [] as Array<unknown>,
  refresh: vi.fn(),
  save: vi.fn(),
  setPinned: vi.fn(),
  setEnabled: vi.fn(),
  remove: vi.fn(),
}));

vi.mock(import("../../state/brain"), () => {
  const command = (name: "save" | "setPinned" | "setEnabled" | "remove") => ({
    run: (value: unknown) => state[name](value),
    permissionAtom: () => Atom.make(state.canEdit),
  });
  return {
    brainEnvironment: {
      live: (target: { readonly input: unknown }) => {
        state.liveInputs.push(target.input);
        return "live";
      },
      save: command("save"),
      setPinned: command("setPinned"),
      setEnabled: command("setEnabled"),
      remove: command("remove"),
    } as never,
  };
});
vi.mock(import("../../state/use-atom-command"), () => ({
  useAtomCommand: ((command: { readonly run: (value: unknown) => unknown }) =>
    command.run) as never,
}));
vi.mock(import("../../state/query"), async (original) => ({
  ...(await original()),
  // The real query keeps one object until the value changes.
  useEnvironmentQuery: (() => {
    const total = state.total ?? state.entries.length;
    if (state.result?.entries !== state.entries || state.result.total !== total) {
      state.result = { entries: state.entries, total };
    }
    return {
      data: state.loading || state.error !== null ? null : state.result,
      error: state.error,
      isPending: state.loading,
      refresh: state.refresh,
    };
  }) as never,
}));
vi.mock(import("../../state/environments"), async (original) => ({
  ...(await original()),
  usePrimaryEnvironmentId: () => environmentId,
  useConnectedEnvironmentIds: (() => (state.connected ? [environmentId] : [])) as never,
  useEnvironments: (() => ({
    isReady: true,
    environments: [{ environmentId, label: "Laptop" }],
    presentationById: new Map(),
  })) as never,
}));
vi.mock(import("../../state/entities"), async (original) => ({
  ...(await original()),
  useProjects: (() => [{ id: projectId, environmentId, title: "Acme app" }]) as never,
}));

function setup() {
  state.entries = [];
  state.total = null;
  state.result = null;
  state.loading = false;
  state.error = null;
  state.canEdit = true;
  state.connected = true;
  state.liveInputs = [];
  state.refresh.mockReset();
  state.save
    .mockReset()
    .mockImplementation(({ input }: { input: BrainEntry }) =>
      success({ ...entry("saved"), ...input, id: input.id ?? BrainEntryId.make("saved") }),
    );
  const listed = (id: string) => (state.entries as Array<BrainEntry>).find((row) => row.id === id);
  state.setPinned
    .mockReset()
    .mockImplementation(({ input }: { input: { id: string; pinned: boolean } }) =>
      success({ ...listed(input.id), pinned: input.pinned }),
    );
  state.setEnabled
    .mockReset()
    .mockImplementation(({ input }: { input: { id: string; enabled: boolean } }) =>
      success({ ...listed(input.id), enabled: input.enabled }),
    );
  state.remove.mockReset().mockImplementation(() => success(undefined));
}

describe("BrainPage", () => {
  it("lists what each entry is, who added it and where it applies", async () => {
    setup();
    state.entries = [
      entry("pinned-one", { title: "Use pnpm", pinned: true }),
      entry("agent-one", {
        title: "Retries go through withBackoff",
        kind: "decision",
        source: "agent",
        projectId: null,
      }),
      entry("off-one", { title: "Old rule", enabled: false }),
    ];
    await using screen = await render(<BrainPage />);
    const pinned = screen.getByRole("button", { name: /Use pnpm/ });
    await expect.element(pinned.getByText("Convention")).toBeVisible();
    await expect.element(pinned.getByText("You")).toBeVisible();
    await expect.element(pinned.getByText("Acme app")).toBeVisible();
    await expect.element(screen.getByLabelText("Pinned")).toBeVisible();
    const inferred = screen.getByRole("button", { name: /Retries go through/ });
    await expect.element(inferred.getByText("Agent")).toBeVisible();
    await expect.element(inferred.getByText("Global")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /Old rule/ }).getByText("Off"))
      .toBeVisible();
  });

  it("edits the selected entry beside the list and saves only what changed", async () => {
    setup();
    state.entries = [entry("one", { title: "Use pnpm", body: "Never npm." })];
    await using screen = await render(<BrainPage />);
    await screen.getByRole("button", { name: /Use pnpm/ }).click();
    const title = screen.getByRole("textbox", { name: "Title" });
    await expect.element(title).toHaveValue("Use pnpm");
    const save = screen.getByRole("button", { name: "Save", exact: true });
    await expect.element(save).toBeDisabled();

    await userEvent.fill(title, "Use pnpm everywhere");
    await save.click();
    await vi.waitFor(() =>
      expect(state.save).toHaveBeenCalledExactlyOnceWith({
        environmentId,
        input: {
          id: BrainEntryId.make("one"),
          projectId,
          kind: "convention",
          title: "Use pnpm everywhere",
          body: "Never npm.",
        },
      }),
    );
  });

  it("creates an entry in the scope being looked at", async () => {
    setup();
    await using screen = await render(<BrainPage />);
    await screen.getByRole("button", { name: "New", exact: true }).click();
    await userEvent.fill(screen.getByRole("textbox", { name: "Title" }), "Ship on Fridays");
    await userEvent.fill(screen.getByRole("textbox", { name: "Body" }), "Agreed in planning.");
    await screen.getByRole("button", { name: "Save", exact: true }).click();
    await vi.waitFor(() =>
      expect(state.save).toHaveBeenCalledExactlyOnceWith({
        environmentId,
        input: {
          projectId: null,
          kind: "note",
          title: "Ship on Fridays",
          body: "Agreed in planning.",
        },
      }),
    );
  });

  it("says why a credential was refused and keeps the draft", async () => {
    setup();
    state.save.mockImplementation(() =>
      Promise.resolve({
        _tag: "Failure" as const,
        cause: Cause.fail(new BrainCredentialError({ field: "body" })),
      }),
    );
    state.entries = [entry("one", { title: "Deploy notes" })];
    await using screen = await render(<BrainPage />);
    await screen.getByRole("button", { name: /Deploy notes/ }).click();
    const body = screen.getByRole("textbox", { name: "Body" });
    await userEvent.fill(body, "password=hunter2");
    await screen.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .element(screen.getByText(/looks like a password, token or private key/))
      .toBeVisible();
    await expect.element(body).toHaveValue("password=hunter2");
  });

  it("marks an agent's entry as inferred, and pins and disables it", async () => {
    setup();
    state.entries = [entry("one", { title: "Inferred fact", source: "agent" })];
    await using screen = await render(<BrainPage />);
    await screen.getByRole("button", { name: /Inferred fact/ }).click();
    await expect.element(screen.getByText(/Added by an agent\. Inferred/)).toBeVisible();

    await screen.getByRole("button", { name: "Pin", exact: true }).click();
    await vi.waitFor(() =>
      expect(state.setPinned).toHaveBeenCalledExactlyOnceWith({
        environmentId,
        input: { id: BrainEntryId.make("one"), pinned: true },
      }),
    );
    await screen.getByRole("switch", { name: "Enabled" }).click();
    await vi.waitFor(() =>
      expect(state.setEnabled).toHaveBeenCalledExactlyOnceWith({
        environmentId,
        input: { id: BrainEntryId.make("one"), enabled: false },
      }),
    );
  });

  it("deletes only after confirmation", async () => {
    setup();
    state.entries = [entry("one", { title: "Old rule" })];
    await using screen = await render(
      <>
        <BrainPage />
        <ConfirmDialogHost />
      </>,
    );
    await screen.getByRole("button", { name: /Old rule/ }).click();
    const editorDelete = screen
      .getByRole("region", { name: "Edit entry" })
      .getByRole("button", { name: "Delete", exact: true });
    await editorDelete.click();
    await expect.element(page.getByRole("alertdialog")).toBeVisible();
    expect(state.remove).not.toHaveBeenCalled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
    expect(state.remove).not.toHaveBeenCalled();

    await editorDelete.click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await vi.waitFor(() =>
      expect(state.remove).toHaveBeenCalledExactlyOnceWith({
        environmentId,
        input: { id: BrainEntryId.make("one") },
      }),
    );
    await expect.element(screen.getByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
  });

  it("filters on the server as the search settles", async () => {
    setup();
    state.entries = [entry("one")];
    await using screen = await render(<BrainPage />);
    await userEvent.fill(screen.getByRole("searchbox", { name: "Search Brain" }), "deploy");
    await vi.waitFor(() => expect(state.liveInputs).toContainEqual({ query: "deploy" }));
  });

  it("offers a clear way out of an empty search", async () => {
    setup();
    await using screen = await render(<BrainPage />);
    await expect.element(screen.getByText("Nothing saved yet")).toBeVisible();
    await userEvent.fill(screen.getByRole("searchbox", { name: "Search Brain" }), "missing");
    await expect.element(screen.getByText("No matching entries")).toBeVisible();
    await screen.getByRole("button", { name: "Clear filters" }).click();
    await expect.element(screen.getByRole("searchbox", { name: "Search Brain" })).toHaveValue("");
    await expect.element(screen.getByText("Nothing saved yet")).toBeVisible();
  });

  it("shows loading, then a failure that can be retried", async () => {
    setup();
    state.loading = true;
    await using screen = await render(<BrainPage />);
    await expect.element(screen.getByRole("status", { name: "Loading Brain" })).toBeVisible();

    state.loading = false;
    state.error = "The environment request failed.";
    await screen.rerender(<BrainPage />);
    await expect.element(screen.getByText("Could not load Brain")).toBeVisible();
    await screen.getByRole("button", { name: "Retry" }).click();
    expect(state.refresh).toHaveBeenCalledOnce();
  });

  it("says when more entries exist than the list shows", async () => {
    setup();
    state.entries = [entry("one")];
    state.total = 340;
    await using screen = await render(<BrainPage />);
    await expect.element(screen.getByText(/Showing the newest 1 of 340/)).toBeVisible();
  });

  it("is read-only without permission to change it", async () => {
    setup();
    state.canEdit = false;
    state.entries = [entry("one", { title: "Use pnpm" })];
    await using screen = await render(<BrainPage />);
    await expect.element(screen.getByRole("button", { name: "New", exact: true })).toBeDisabled();
    await screen.getByRole("button", { name: /Use pnpm/ }).click();
    await expect.element(screen.getByRole("textbox", { name: "Title" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "Pin", exact: true })).toBeDisabled();
    await expect
      .element(screen.getByRole("button", { name: "Delete", exact: true }))
      .toBeDisabled();
  });

  it("says when no environment is connected", async () => {
    setup();
    state.connected = false;
    await using screen = await render(<BrainPage />);
    await expect.element(screen.getByText("No environment connected")).toBeVisible();
  });
});
