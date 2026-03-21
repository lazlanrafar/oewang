"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface InputDateProps {
  value?: string; // yyyy-MM-dd
  onChange?: (date: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function InputDate({
  value,
  onChange,
  className,
  placeholder = "Pick a date",
  disabled,
}: InputDateProps) {
  const date =
    value && !isNaN(parseISO(value).getTime()) ? parseISO(value) : undefined;

  return (
    <Popover modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal bg-transparent h-9 transition-colors hover:bg-muted/10 border-input hover:border-foreground/20",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
          {date ? format(date, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(newDate) => {
            if (newDate) {
              onChange?.(format(newDate, "yyyy-MM-dd"));
            }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
