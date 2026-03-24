"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icons,
} from "../atoms";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Skeleton } from "./skeleton";

// --- BaseCanvas ---
export function BaseCanvas({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col h-full bg-background overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

// --- CanvasHeader ---
interface CanvasHeaderProps {
  title?: string;
  subtitle?: string;
  className?: string;
  onDownload?: () => Promise<void>;
  onShare?: () => Promise<void>;
  tabs?: React.ReactNode;
  action?: React.ReactNode;
}

export function CanvasHeader({
  title,
  subtitle,
  className,
  onDownload,
  onShare,
  tabs,
  action,
}: CanvasHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-6 py-4",
        className,
        tabs ? "px-0 py-0" : "",
      )}
    >
      {tabs ? (
        <div className="flex-1 w-full">{tabs}</div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {title && (
            <h3 className="text-[18px] font-normal font-serif text-black dark:text-white">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-[12px] text-[#707070] dark:text-[#666666]">
              {subtitle}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-end mr-1.5 z-10">
        {action}
        {(onDownload || onShare) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
                <Icons.MoreVertical
                  size={15}
                  className="text-[#707070] dark:text-[#666666] text-muted-foreground"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="rounded-xl border-border/50"
            >
              {onShare && (
                <DropdownMenuItem onClick={onShare} className="text-xs">
                  <Icons.Share className="mr-2 h-3.5 w-3.5" />
                  Share
                </DropdownMenuItem>
              )}
              {onDownload && (
                <DropdownMenuItem onClick={onDownload} className="text-xs">
                  <Icons.Download className="mr-2 h-3.5 w-3.5" />
                  Download
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// --- CanvasContent ---
export function CanvasContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex-1 overflow-y-auto scrollbar-hide px-6 py-6 animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out",
        className,
      )}
      data-canvas-content
    >
      {children}
    </div>
  );
}

// --- CanvasChart ---
interface CanvasChartProps {
  title?: string;
  children: React.ReactNode;
  isLoading?: boolean;
  height?: string | number;
  className?: string;
  legend?: {
    items: Array<{ label: string; type: "solid" | "pattern" }>;
  };
}

export function CanvasChart({
  title,
  children,
  isLoading,
  height = "20rem",
  className,
  legend,
}: CanvasChartProps) {
  if (isLoading) {
    return (
      <Skeleton
        className={cn("w-full rounded-none", className)}
        style={{ height }}
      />
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {title && (
        <div className="flex items-center justify-between">
          <h4 className="text-[18px] font-normal font-serif text-black dark:text-white">
            {title}
          </h4>
          {legend && (
            <div className="flex items-center gap-4">
              {legend.items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-1.5 text-[12px] text-[#707070] dark:text-[#666666]"
                >
                  <div
                    className={cn(
                      "size-2 rounded-full",
                      item.type === "solid"
                        ? "bg-black dark:bg-white"
                        : "bg-black/20 dark:bg-white/20",
                    )}
                  />
                  {item.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ height }}>{children}</div>
    </div>
  );
}

// --- CanvasGrid ---
interface CanvasGridProps {
  items: Array<{
    id: string;
    title: string;
    value: string;
    subtitle?: string;
  }>;
  layout?: "2/2" | "3/1" | "1/3";
  isLoading?: boolean;
  className?: string;
}

export function CanvasGrid({
  items,
  layout = "2/2",
  isLoading,
  className,
}: CanvasGridProps) {
  if (isLoading) {
    return (
      <div
        className={cn(
          "grid gap-3",
          layout === "2/2" ? "grid-cols-2" : "grid-cols-1 md:grid-cols-3",
          className,
        )}
      >
        {Array.from({ length: items.length || 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-none" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-3",
        layout === "2/2" ? "grid-cols-2" : "grid-cols-1 md:grid-cols-3",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="p-3 bg-white dark:bg-[#0c0c0c] border border-[#e6e6e6] dark:border-[#1d1d1d] space-y-1"
        >
          <p className="text-[12px] text-[#707070] dark:text-[#666666] mb-1">
            {item.title}
          </p>
          <p className="text-[18px] font-normal font-sans text-black dark:text-white mb-1">
            {item.value}
          </p>
          {item.subtitle && (
            <p className="text-[10px] text-[#707070] dark:text-[#666666]">
              {item.subtitle}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// --- CanvasSection ---
interface CanvasSectionProps {
  title: string;
  children: React.ReactNode;
  isLoading?: boolean;
  className?: string;
}

export function CanvasSection({
  title,
  children,
  isLoading,
  className,
}: CanvasSectionProps) {
  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-[18px] w-48 rounded-none" />
        <div className="border border-[#e6e6e6] dark:border-[#1d1d1d] p-4">
          <Skeleton className="h-20 w-full rounded-none" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <h4 className="text-[18px] font-normal font-serif text-black dark:text-white">
        {title}
      </h4>
      <div className="text-[14px] leading-relaxed text-[#707070] dark:text-[#666666] whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}
