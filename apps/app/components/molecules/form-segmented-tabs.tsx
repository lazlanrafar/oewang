"use client";

import { cn, tabsListVariants, tabsTriggerVariants } from "@workspace/ui";

export interface SegmentedTabOption<TValue extends string> {
  value: TValue;
  label: string;
}

interface FormSegmentedTabsProps<TValue extends string> {
  value: TValue;
  options: SegmentedTabOption<TValue>[];
  onChange: (value: TValue) => void;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

export function FormSegmentedTabs<TValue extends string>({
  value,
  options,
  onChange,
  disabled = false,
  className,
  triggerClassName,
}: FormSegmentedTabsProps<TValue>) {
  return (
    <div className={cn(tabsListVariants({ variant: "segmented" }), "w-full", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          // data-state lets the shared segmented variant style the active tab (primary)
          data-state={value === option.value ? "active" : "inactive"}
          className={cn(
            tabsTriggerVariants({ variant: "segmented" }),
            "flex-1 justify-center disabled:pointer-events-none disabled:opacity-50",
            triggerClassName,
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
