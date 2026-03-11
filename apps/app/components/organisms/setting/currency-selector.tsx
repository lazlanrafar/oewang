"use client";

import { useMemo, useState } from "react";

import { COUNTRIES } from "@workspace/constants";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui";
import { Check, ChevronsUpDown } from "lucide-react";

interface Currency {
  name: string;
  flag: string;
  currency: {
    code: string;
    symbol: string;
  } | null;
}

interface CurrencySelectorProps {
  value?: string;
  onSelect: (currency: NonNullable<Currency["currency"]> & { countryName: string }) => void;
  trigger?: React.ReactNode;
  className?: string;
}

export function CurrencySelector({ value, onSelect, trigger, className }: CurrencySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredCurrencies = useMemo(() => {
    return (COUNTRIES as Currency[]).filter((c) => {
      if (!c.currency) return false;
      const searchStr = `${c.name} ${c.currency.code} ${c.currency.symbol}`.toLowerCase();
      return searchStr.includes(search.toLowerCase());
    });
  }, [search]);

  // Group by first letter
  const groupedCurrencies = useMemo(() => {
    const groups: Record<string, Currency[]> = {};
    for (const c of filteredCurrencies) {
      if (!c.currency) continue;
      const letter = c.currency.code[0]!.toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(c);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredCurrencies]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between", className)}
          >
            {value || "Select currency..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search currency..." value={search} onValueChange={setSearch} />
          <CommandList className="max-h-[300px] overflow-y-auto overflow-x-hidden">
            <CommandEmpty>No currency found.</CommandEmpty>
            {groupedCurrencies.map(([letter, currencies]) => (
              <CommandGroup key={letter} heading={letter}>
                {currencies.map((c) => (
                  <CommandItem
                    key={`${c.name}-${c.currency!.code}`}
                    value={`${c.currency!.code} - ${c.name} (${c.currency!.symbol})`}
                    onSelect={() => {
                      if (!c.currency) return;
                      onSelect({
                        code: c.currency.code,
                        symbol: c.currency.symbol,
                        countryName: c.name,
                      });
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", value?.startsWith(c.currency!.code) ? "opacity-100" : "opacity-0")}
                    />
                    <span className="text-sm font-medium">
                      {c.currency!.code} - {c.name} ({c.currency!.symbol})
                    </span>
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
