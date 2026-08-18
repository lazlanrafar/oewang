import { Sparkles } from "lucide-react";

// A short AI Q&A panel — used for the AI feature chapter.
export function AiChatCard() {
  return (
    <div className="flex h-full w-full flex-col bg-[hsl(var(--background))] p-5 sm:p-6">
      <div className="flex items-center gap-2 border-border/70 border-b pb-3 text-foreground text-sm">
        <span className="flex size-7 items-center justify-center border border-border bg-[hsl(var(--surface))] text-[hsl(var(--brand-accent))]">
          <Sparkles className="size-4" />
        </span>
        Ask Oewang
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <div className="max-w-[80%] self-end bg-[hsl(var(--brand-accent))] px-3.5 py-2.5 text-[13px] text-[hsl(var(--brand-accent-foreground))] leading-snug">
          How much did I spend on food this month?
        </div>
        <div className="max-w-[86%] self-start border border-border bg-[hsl(var(--surface))] px-3.5 py-2.5 text-[13px] text-foreground/90 leading-snug">
          <span className="font-serif text-foreground">Rp 1.240.000</span> on Food &amp; Drink — about 18% of your spending, down 6% from last month.
        </div>
        <div className="max-w-[80%] self-end bg-[hsl(var(--brand-accent))] px-3.5 py-2.5 text-[13px] text-[hsl(var(--brand-accent-foreground))] leading-snug">
          What's due this week?
        </div>
        <div className="max-w-[86%] self-start border border-border bg-[hsl(var(--surface))] px-3.5 py-2.5 text-[13px] text-foreground/90 leading-snug">
          Netflix (Rp 186.000) on Fri and your Studio invoice (Rp 4.500.000) on Sat.
        </div>
      </div>
    </div>
  );
}
