"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/utils";

type FilterToggleOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
};

type FilterToggleProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: FilterToggleOption<T>[];
  className?: string;
};

function FilterToggle<T extends string>({
  value,
  onValueChange,
  options,
  className,
}: FilterToggleProps<T>) {
  return (
    <div className={cn("flex w-fit items-stretch bg-[#f7f7f7] dark:bg-[#131313]", className)}>
      <TabsPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
        <TabsPrimitive.List className="flex h-auto items-stretch bg-transparent p-0">
          {options.map((option) => (
            <TabsPrimitive.Trigger
              key={option.value}
              value={option.value}
              className={cn(
                "group relative flex h-9 min-h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap border border-transparent px-3 py-1.5 text-[14px] transition-all",
                "z-1 mb-0 bg-[#f7f7f7] text-[#707070] hover:text-black dark:bg-[#131313] dark:text-[#666666] dark:hover:text-white",
                "data-[state=active]:-mb-px data-[state=active]:z-10 data-[state=active]:bg-[#e6e6e6] data-[state=active]:text-black dark:data-[state=active]:bg-[#1d1d1d] dark:data-[state=active]:text-white",
              )}
            >
              {option.icon}
              {option.label}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
      </TabsPrimitive.Root>
    </div>
  );
}

export { FilterToggle };
export type { FilterToggleOption, FilterToggleProps };
