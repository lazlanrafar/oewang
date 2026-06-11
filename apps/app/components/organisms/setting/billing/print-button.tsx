"use client";

import { Button } from "@workspace/ui";

export function PrintButton() {
  return (
    <Button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
      className="h-8 rounded-none px-3 font-medium text-[10px] uppercase tracking-widest"
    >
      Print / Save PDF
    </Button>
  );
}
