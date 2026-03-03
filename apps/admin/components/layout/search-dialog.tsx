"use client";
import * as React from "react";

import {
  Button,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/ui";
import {
  LayoutDashboard,
  Search,
  ShoppingBag,
  Users,
  Banknote,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { searchOrdersAction } from "@/server/server-actions";
import type { AdminOrderListing } from "@workspace/types";

const searchItems = [
  {
    group: "General",
    icon: LayoutDashboard,
    label: "Overview",
    url: "/overview",
  },
  { group: "General", icon: ShoppingBag, label: "Orders", url: "/orders" },
  { group: "Management", icon: Users, label: "Users", url: "/users" },
  { group: "Management", icon: Banknote, label: "Pricing", url: "/pricing" },
];

export function SearchDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [orders, setOrders] = React.useState<AdminOrderListing[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  // Keyboard shortcut listener
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Clear states when dialog normally closes
  React.useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setDebouncedSearch("");
      setOrders([]);
    }
  }, [open]);

  // Debounce user input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch orders from API dynamically
  React.useEffect(() => {
    if (!debouncedSearch) {
      setOrders([]);
      setIsSearching(false);
      return;
    }

    let isMounted = true;
    setIsSearching(true);

    searchOrdersAction(debouncedSearch)
      .then((res) => {
        if (isMounted && res.success && res.data) {
          setOrders(res.data.orders);
        }
      })
      .finally(() => {
        if (isMounted) setIsSearching(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedSearch]);

  return (
    <>
      <Button
        variant="link"
        className="!px-0 font-normal text-muted-foreground hover:no-underline"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        Search
        <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px]">
          <span className="text-xs">⌘</span>J
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search dashboards, users, and more…"
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          <CommandEmpty>
            {isSearching ? "Searching..." : "No results found."}
          </CommandEmpty>

          {/* Static Navigation Items */}
          {[...new Set(searchItems.map((item) => item.group))].map(
            (group, i) => (
              <React.Fragment key={group}>
                {i !== 0 && <CommandSeparator />}
                <CommandGroup heading={group} key={group}>
                  {searchItems
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <CommandItem
                        className="!py-1.5"
                        key={item.label}
                        onSelect={() => {
                          setOpen(false);
                          if (item.url) router.push(item.url);
                        }}
                      >
                        {item.icon && <item.icon />}
                        <span>{item.label}</span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              </React.Fragment>
            ),
          )}

          {/* Dynamic Database Results for Orders */}
          {orders.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Recent Orders">
                {orders.map((order) => (
                  <CommandItem
                    key={order.id}
                    className="!py-2 flex items-center justify-between"
                    onSelect={() => {
                      setOpen(false);
                      router.push(`/orders?search=${order.code}`);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-muted-foreground mr-2" />
                      <div className="flex flex-col">
                        <span className="font-medium text-sm uppercase">
                          {order.code}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {order.userName || order.userEmail}
                        </span>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
