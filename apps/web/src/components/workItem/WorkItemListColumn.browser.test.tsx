import { createRef, type ReactNode, type RefObject, useState } from "react";
import { page, userEvent } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { registerCommands } from "../../shortcuts/dispatcher";
import { PullRequestSearchInput } from "../pullRequest/PullRequestListFilters";
import { WorkItemListColumn } from "./WorkItemListColumn";

import "~/index.css";

function createColumn(
  maximizedAway: boolean,
  scrollRef: RefObject<HTMLDivElement | null>,
  searchInput: ReactNode = <input aria-label="Search pull requests" />,
) {
  return (
    <WorkItemListColumn
      area="pull-requests"
      title="Pull requests"
      icon={null}
      refreshLabel="Refresh pull requests"
      refreshing={false}
      onRefresh={() => {}}
      providerMenu={null}
      searchInput={searchInput}
      sortMenu={null}
      filtersMenu={null}
      savedViewsMenu={null}
      rightPanelOpen={maximizedAway}
      maximizedAway={maximizedAway}
      split={false}
      listBody={null}
      scrollRef={scrollRef}
    />
  );
}

function dispatchFindShortcut() {
  const event = new KeyboardEvent("keydown", {
    key: "f",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

describe("WorkItemListColumn find shortcut", () => {
  it("leaves Cmd/Ctrl+F to the browser while the detail panel is maximized", async () => {
    const scrollRef = createRef<HTMLDivElement>();
    await using screen = await render(createColumn(false, scrollRef));

    await screen.rerender(createColumn(true, scrollRef));
    expect(dispatchFindShortcut().defaultPrevented).toBe(false);

    await screen.rerender(createColumn(false, scrollRef));
    expect(dispatchFindShortcut().defaultPrevented).toBe(true);
    await expect
      .element(screen.getByRole("textbox", { name: "Search pull requests" }))
      .toHaveFocus();
  });
});

function SearchColumn({
  scrollRef,
  onSubmit,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  onSubmit: (value: string) => void;
}) {
  const [query, setQuery] = useState("label:bug");
  return createColumn(
    false,
    scrollRef,
    <PullRequestSearchInput
      value={query}
      label="Search pull requests"
      placeholder="Search pull requests"
      onChange={setQuery}
      onSubmit={onSubmit}
    />,
  );
}

describe("WorkItemListColumn search", () => {
  it("Escape clears the search before the page's Escape leaves", async () => {
    const onSubmit = vi.fn();
    const scrollRef = createRef<HTMLDivElement>();
    await using _screen = await render(<SearchColumn scrollRef={scrollRef} onSubmit={onSubmit} />);
    // Mirrors the /pull-requests observer, which leaves on an unclaimed Escape.
    const leave = vi.fn();
    using stack = new DisposableStack();
    stack.defer(
      registerCommands(
        {},
        {
          observe: (event, consumed) => {
            if (!consumed && !event.repeat && !event.isComposing && event.key === "Escape") leave();
          },
        },
      ),
    );
    const search = page.getByRole("searchbox", { name: "Search pull requests" });
    // Safari ends the composition just before the confirming keydown, reporting only keyCode 229.
    const pressDuringComposition = (key: string) =>
      act(() => {
        for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
          search.element().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
          search
            .element()
            .dispatchEvent(new KeyboardEvent("keydown", { key, ...composition, bubbles: true }));
        }
      });

    await userEvent.click(search);
    await pressDuringComposition("Enter");
    await pressDuringComposition("Escape");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
    await expect.element(search).toHaveValue("label:bug");

    await userEvent.keyboard("{Escape}");
    await expect.element(search).toHaveValue("");
    await expect.element(search).toHaveFocus();
    expect(leave).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    expect(leave).toHaveBeenCalledOnce();
  });
});
