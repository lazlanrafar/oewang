"use client";

import { Button, cn } from "@workspace/ui";

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
    <div className={cn("flex w-full overflow-hidden bg-muted/30", className)}>
      {options.map((option, index) => (
        <Button
          key={option.value}
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "h-full flex-1 rounded-none text-xs",
            index < options.length - 1 && "last:border-r-0",
            value === option.value
              ? "bg-muted font-medium shadow-sm"
              : "bg-transparent text-muted-foreground hover:bg-muted/50",
            triggerClassName,
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

