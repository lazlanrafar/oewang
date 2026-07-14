import { Check } from "lucide-react";

type Ws = { name: string; meta: string; balance: string; active: boolean; initial: string };

const WORKSPACES: Ws[] = [
  { name: "Personal", meta: "Just you", balance: "Rp 4.200.000", active: true, initial: "P" },
  { name: "Family", meta: "3 members", balance: "Rp 1.850.000", active: false, initial: "F" },
  { name: "Studio Oewang", meta: "5 members", balance: "Rp 12.480.000", active: false, initial: "S" },
];

// Workspace switcher — used for the Workspaces feature chapter.
export function WorkspacesCard() {
  return (
    <div className="h-full w-full bg-[hsl(var(--background))] p-5 sm:p-6">
      <p className="font-serif text-foreground text-lg tracking-tight">Workspaces</p>
      <p className="mt-1 text-muted-foreground text-xs">One account · isolated records</p>

      <div className="mt-4 space-y-2">
        {WORKSPACES.map((w) => (
          <div
            key={w.name}
            className={`flex items-center gap-3 border px-3.5 py-3 ${
              w.active
                ? "border-[hsl(var(--brand-accent))]/50 bg-[hsl(var(--brand-accent))]/10"
                : "border-border bg-[hsl(var(--card))]"
            }`}
          >
            <span className="flex size-9 items-center justify-center border border-border bg-[hsl(var(--surface))] font-serif text-foreground text-sm">
              {w.initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] text-foreground">{w.name}</p>
              <p className="text-[12px] text-muted-foreground">{w.meta}</p>
            </div>
            <span className="font-medium text-[14px] text-foreground">{w.balance}</span>
            {w.active && (
              <span className="flex size-5 items-center justify-center bg-[hsl(var(--brand-accent))] text-[hsl(var(--brand-accent-foreground))]">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
