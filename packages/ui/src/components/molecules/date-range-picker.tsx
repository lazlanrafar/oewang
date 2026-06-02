"use client";

import {
  endOfMonth,
  endOfYear,
  format,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import type React from "react";
import type { DateRange } from "react-day-picker";
import { cn } from "../../lib/utils";
import { Button } from "../atoms/button";
import { Calendar } from "../atoms/calendar";
import { Icons } from "../atoms/icons";
import { Popover, PopoverContent, PopoverTrigger } from "../atoms/popover";

type Props = {
  range?: DateRange;
  className?: string;
  onSelect: (range?: DateRange) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function DateRangePickerContent({
  range,
  onSelect,
}: {
  range?: DateRange;
  onSelect: (range?: DateRange) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x">
      <div className="flex flex-col gap-1 p-3 w-full sm:w-[150px]">
        <div className="text-xs font-semibold text-muted-foreground mb-1 px-2 uppercase tracking-wide">
          Presets
        </div>
        <Button
          variant="ghost"
          className="justify-start font-normal text-sm h-8 px-2"
          onClick={() =>
            onSelect({
              from: new Date(),
              to: new Date(),
            })
          }
        >
          Today
        </Button>
        <Button
          variant="ghost"
          className="justify-start font-normal text-sm h-8 px-2"
          onClick={() =>
            onSelect({
              from: subDays(new Date(), 7),
              to: new Date(),
            })
          }
        >
          Last 7 Days
        </Button>
        <Button
          variant="ghost"
          className="justify-start font-normal text-sm h-8 px-2"
          onClick={() =>
            onSelect({
              from: startOfMonth(new Date()),
              to: endOfMonth(new Date()),
            })
          }
        >
          This Month
        </Button>
        <Button
          variant="ghost"
          className="justify-start font-normal text-sm h-8 px-2"
          onClick={() =>
            onSelect({
              from: startOfMonth(subMonths(new Date(), 1)),
              to: endOfMonth(subMonths(new Date(), 1)),
            })
          }
        >
          Last Month
        </Button>
        <Button
          variant="ghost"
          className="justify-start font-normal text-sm h-8 px-2"
          onClick={() =>
            onSelect({
              from: subMonths(new Date(), 3),
              to: new Date(),
            })
          }
        >
          Past 3 Months
        </Button>
        <Button
          variant="ghost"
          className="justify-start font-normal text-sm h-8 px-2"
          onClick={() =>
            onSelect({
              from: startOfYear(new Date()),
              to: endOfYear(new Date()),
            })
          }
        >
          This Year
        </Button>
      </div>
      <div className="p-1">
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={range?.from}
          selected={range}
          onSelect={onSelect}
          numberOfMonths={2}
        />
      </div>
    </div>
  );
}

export function DateRangePicker({
  className,
  range,
  disabled,
  onSelect,
  placeholder,
}: Props) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild disabled={disabled}>
          <Button
            variant="outline"
            className={cn("justify-between text-left font-medium space-x-2")}
          >
            <span>
              {range?.from ? (
                range.to ? (
                  <>
                    {format(range.from, "LLL dd, y")} -{" "}
                    {format(range.to, "LLL dd, y")}
                  </>
                ) : (
                  format(range.from, "LLL dd, y")
                )
              ) : (
                placeholder
              )}
            </span>
            <Icons.ChevronDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 mt-2" align="start">
          <DateRangePickerContent range={range} onSelect={onSelect} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
