import type { ReactNode } from "react";

// Small uppercase, teal-tracked eyebrow used above every section title.
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-[hsl(var(--brand-accent))] uppercase tracking-[0.28em]">
      <span className="inline-block size-1 bg-[hsl(var(--brand-accent))]" />
      {children}
    </span>
  );
}

// Consistent max-width container.
export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}
