"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
} from "@workspace/ui";
import { COUNTRIES } from "@workspace/constants";
import { useState, useMemo } from "react";

export interface CurrencySelectorProps {
  value?: string;
  onChange: (currency: string) => void;
  onSelect?: () => void;
  className?: string;
}

export interface SelectCurrencyProps {
  value?: string;
  onChange: (currency: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function CurrencySelector({
  value,
  onChange,
  onSelect,
  className,
}: CurrencySelectorProps) {
  const [searchValue, setSearchValue] = useState("");

  const currencies = useMemo(() => {
    const uniqueCurrencies = new Map<
      string,
      { code: string; symbol: string }
    >();
    for (const country of COUNTRIES) {
      if (country.currency) {
        uniqueCurrencies.set(country.currency.code, country.currency);
      }
    }
    return Array.from(uniqueCurrencies.values()).sort((a, b) =>
      a.code.localeCompare(b.code),
    );
  }, []);

  const filteredCurrencies = useMemo(() => {
    if (!searchValue) return currencies;
    return currencies.filter((c) =>
      c.code.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [currencies, searchValue]);

  return (
    <Command className={cn("font-sans", className)} shouldFilter={false}>
      <CommandInput
        placeholder="Search currencies..."
        value={searchValue}
        onValueChange={setSearchValue}
        className="h-9"
      />
      <CommandList
        className="max-h-[300px] overflow-y-auto"
        onWheel={(e) => e.stopPropagation()}
      >
        {filteredCurrencies.length === 0 && ( searchValue.length > 0 ) && (
          <CommandEmpty className="py-4 text-xs text-center text-muted-foreground">
            No currency found.
          </CommandEmpty>
        )}

        <CommandGroup>
          {filteredCurrencies.map((currency) => (
            <CommandItem
              key={currency.code}
              value={currency.code}
              onSelect={() => {
                onChange(currency.code);
                onSelect?.();
                setSearchValue("");
              }}
              className="text-xs py-2 flex items-center justify-between cursor-pointer"
            >
              <span className="font-medium">
                {currency.code} ({currency.symbol})
              </span>
              {value === currency.code && (
                <Check className="h-3.5 w-3.5 text-primary ml-2 shrink-0" />
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export function SelectCurrency({
  value,
  onChange,
  className,
  disabled,
  placeholder = "Select currency",
}: SelectCurrencyProps) {
  const [open, setOpen] = useState(false);

  // We need to get the symbol for the display button
  const currencies = useMemo(() => {
    const uniqueCurrencies = new Map<
      string,
      { code: string; symbol: string }
    >();
    for (const country of COUNTRIES) {
      if (country.currency) {
        uniqueCurrencies.set(country.currency.code, country.currency);
      }
    }
    return Array.from(uniqueCurrencies.values());
  }, []);
  
  const selectedCurrency = currencies.find((c) => c.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex items-center gap-2 min-w-0 transition-colors group text-left w-full h-8",
            "hover:bg-muted/10 px-2 rounded-sm",
            "cursor-pointer",
            className,
          )}
        >
          <span className="text-xs font-sans text-foreground truncate flex-1 uppercase tracking-wider font-medium">
            {selectedCurrency
              ? `${selectedCurrency.code} (${selectedCurrency.symbol})`
              : placeholder}
          </span>
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[200px]"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <CurrencySelector 
          value={value} 
          onChange={onChange} 
          onSelect={() => setOpen(false)} 
        />
      </PopoverContent>
    </Popover>
  );
}
