import { type ReactNode } from "react";

import { Sheet, SheetHeader, SheetPopup, SheetTitle } from "../src/components/ui/sheet";

/** A modal sheet that closes on Escape, for tests that check an inner Escape stays inside it. */
export function ClosingSheet(props: {
  animationDurationMs: number;
  children: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <SheetPopup
        transitionDurationMs={props.animationDurationMs}
        side="right"
        showCloseButton={false}
        keepMounted
        className="w-[min(42vw,28rem)] min-w-80"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Sheet</SheetTitle>
        </SheetHeader>
        {props.children}
      </SheetPopup>
    </Sheet>
  );
}
