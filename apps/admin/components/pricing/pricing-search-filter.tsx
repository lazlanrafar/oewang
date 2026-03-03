"use client";

import {
  cn,
  DropdownMenu,
  DropdownMenuTrigger,
  Icons,
  Input,
} from "@workspace/ui";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import React, { useRef, useState, useEffect } from "react";

export default function PricingSearchFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [placeholder, setPlaceholder] = useState("Search pricing plans");
  const [input, setInput] = useState(searchParams.get("search") || "");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      const currentSearch = params.get("search") || "";

      if (input === currentSearch) return;

      if (input) {
        params.set("search", input);
      } else {
        params.delete("search");
      }
      // Reset to page 1 on new search
      params.set("page", "1");

      router.push(`${pathname}?${params.toString()}`);
    }, 500);

    return () => clearTimeout(timer);
  }, [input, pathname, router, searchParams]);

  const handleSearch = (evt: React.ChangeEvent<HTMLInputElement>) => {
    setInput(evt.target.value);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-2 sm:space-y-0 items-stretch sm:items-center w-full md:w-auto">
        <form
          className="relative flex-1 sm:flex-initial"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <Icons.Search className="absolute pointer-events-none left-3 top-[11px]" />
          <Input
            ref={inputRef}
            placeholder={placeholder}
            className="pl-9 w-full sm:w-[350px] pr-8"
            value={input}
            onChange={handleSearch}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
          />

          {input ? (
            <button
              onClick={() => setInput("")}
              type="button"
              className="absolute z-10 right-3 top-[10px] opacity-50 transition-opacity duration-300 hover:opacity-100 cursor-pointer"
            >
              <Icons.Close className="h-4 w-4" />
            </button>
          ) : (
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "absolute z-10 right-3 top-[10px] opacity-50 transition-opacity duration-300 hover:opacity-100",
                  isOpen && "opacity-100",
                )}
              >
                <Icons.Filter className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
          )}
        </form>
      </div>
    </DropdownMenu>
  );
}
