import { Check, Sparkles } from "lucide-react";

// The "capture" moment — a forwarded receipt parsed into a transaction by AI.
export function CaptureCard() {
  return (
    <div className="h-full w-full bg-[hsl(var(--background))] p-5 sm:p-6">
      <div className="flex items-center gap-2 text-[hsl(var(--brand-accent))] text-xs">
        <Sparkles className="size-3.5" />
        <span className="uppercase tracking-wider">Captured via WhatsApp</span>
      </div>

      <div className="mt-4 grid grid-cols-[132px_1fr] gap-4">
        {/* Receipt */}
        <div className="border border-border bg-[hsl(var(--surface))] p-2">
          <div className="space-y-1.5 bg-[hsl(var(--card))] p-3">
            <div className="mx-auto h-2.5 w-16 bg-muted-foreground/30" />
            <div className="h-2 w-full bg-muted-foreground/15" />
            <div className="h-2 w-full bg-muted-foreground/15" />
            <div className="h-2 w-2/3 bg-muted-foreground/15" />
            <div className="h-2 w-full bg-muted-foreground/15" />
            <div className="mt-2 flex justify-between">
              <div className="h-2.5 w-9 bg-muted-foreground/30" />
              <div className="h-2.5 w-12 bg-[hsl(var(--brand-accent))]/60" />
            </div>
          </div>
          <p className="px-1 pt-1.5 text-[10px] text-muted-foreground">receipt.jpg</p>
        </div>

        {/* Parsed fields */}
        <div className="border border-border">
          {[
            ["Merchant", "Kopi Kenangan"],
            ["Amount", "-Rp 45.000"],
            ["Date", "19 Jun 2025"],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between border-border/60 border-b px-3.5 py-2.5 text-[13px]"
            >
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium text-foreground">{v}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
            <span className="text-muted-foreground">Category</span>
            <span className="inline-flex items-center gap-1.5 bg-[hsl(var(--brand-accent))]/15 px-2 py-0.5 text-[11px] text-[hsl(var(--brand-accent))]">
              <Sparkles className="size-3" />
              Food &amp; Drink
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 border border-[hsl(var(--brand-accent))]/30 bg-[hsl(var(--brand-accent))]/10 px-3.5 py-2.5 text-[13px] text-foreground/90">
        <span className="flex size-4 items-center justify-center bg-[hsl(var(--brand-accent))] text-[hsl(var(--brand-accent-foreground))]">
          <Check className="size-3" strokeWidth={3} />
        </span>
        Categorized and filed automatically — no manual entry.
      </div>
    </div>
  );
}
