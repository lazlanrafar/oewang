"use client";

import { useMemo, useState } from "react";

import { COUNTRIES } from "@workspace/constants";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "../atoms/button";
import { cn } from "../../lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../atoms/command";
import { Popover, PopoverContent, PopoverTrigger } from "../atoms/popover";

interface Country {
  name: string;
  flag: string;
}

interface CountrySelectorProps {
  value?: string;
  onSelect: (countryName: string) => void;
  trigger?: React.ReactNode;
  className?: string;
}

export function CountrySelector({
  value,
  onSelect,
  trigger,
  className,
}: CountrySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredCountries = useMemo(() => {
    return (COUNTRIES as Country[]).filter((c) => {
      const searchStr = c.name.toLowerCase();
      return searchStr.includes(search.toLowerCase());
    });
  }, [search]);

  // Group by first letter
  const groupedCountries = useMemo(() => {
    const groups: Record<string, Country[]> = {};
    for (const c of filteredCountries) {
      const letter = c.name[0]!.toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(c);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredCountries]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between font-normal", className)}
          >
            {value || "Select country..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder="Search country..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[300px] overflow-y-auto overflow-x-hidden">
            <CommandEmpty>No country found.</CommandEmpty>
            {groupedCountries.map(([letter, countries]) => (
              <CommandGroup key={letter} heading={letter}>
                {countries.map((c) => (
                  <CommandItem
                    key={c.name}
                    value={c.name}
                    onSelect={() => {
                      onSelect(c.name);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === c.name ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <img
                      src={c.flag}
                      alt={`${c.name} flag`}
                      className="mr-2 h-3 w-4 rounded-sm object-cover"
                    />
                    <span className="text-sm">{c.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
