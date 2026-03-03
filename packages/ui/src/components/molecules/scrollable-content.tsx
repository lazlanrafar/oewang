import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface ScrollableContentProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper component that responds to scroll-to-hide header behavior.
 * Use this to wrap content that should move up when the header hides on scroll.
 * Used primarily for table pages (transactions, invoices, etc.)
 */
export function ScrollableContent({
  children,
  className,
}: ScrollableContentProps) {
  return (
    <div
      className={cn("transition-transform", className)}
      style={{
        transform: "translateY(calc(var(--header-offset, 0px) * -1))",
        transitionDuration: "var(--header-transition, 200ms)",
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}
