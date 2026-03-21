import * as React from "react";
import { cn } from "../../lib/utils";

const Skeleton = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & { animate?: boolean }
>(({ className, animate = true, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="skeleton"
    className={cn(
      "relative overflow-hidden",
      "bg-muted",
      "bg-linear-to-r from-transparent via-black/10 dark:via-white/10 to-transparent",
      "bg-size-[200%_100%]",
      animate && "animate-shimmer",
      className,
    )}
    {...props}
  />
));
Skeleton.displayName = "Skeleton";

export { Skeleton };
