"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchStore } from "@/stores/search";
import {
  Button,
  Icons,
  Kbd,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
} from "@workspace/ui";
import { getTransactions } from "@workspace/modules/transaction/transaction.action";
import {
  getVaultFiles,
  type VaultFile,
} from "@workspace/modules/vault/vault.action";
import type { Transaction } from "@workspace/types";
import { formatBytes } from "@workspace/utils";
import { format } from "date-fns";
import { useAppStore } from "@/stores/app";

const SHORTCUTS = [
  { label: "Overview", icon: Icons.Overview, href: "/en/overview" },
  { label: "Transactions", icon: Icons.Transactions, href: "/en/transactions" },
  { label: "Invoices", icon: Icons.Invoice, href: "/en/invoices" },
  { label: "Accounts", icon: Icons.Accounts, href: "/en/accounts" },
  { label: "Customers", icon: Icons.Customers, href: "/en/customers" },
  { label: "Vault", icon: Icons.Vault, href: "/en/vault" },
];

const SETTINGS_ITEMS = [
  {
    label: "Profile Settings",
    icon: Icons.Settings,
    href: "/en/settings/profile",
  },
  {
    label: "Appearance",
    icon: Icons.Settings,
    href: "/en/settings/appearance",
  },
];

export function SearchDialog() {
  const { isOpen, setOpen } = useSearchStore();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [vaultFiles, setVaultFiles] = useState<VaultFile[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [debounceDelay, setDebounceDelay] = useState(200);
  const [isFetching, setIsFetching] = useState(false);
  const { settings, formatCurrency } = useAppStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen();
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setOpen]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (isOpen) {
        const fetchData = async () => {
          setIsFetching(true);
          try {
            const [transactionsRes, vaultRes] = await Promise.all([
              getTransactions({ limit: 5, search: debouncedSearch }),
              getVaultFiles(1, 5, debouncedSearch),
            ]);

            if (transactionsRes.success && transactionsRes.data) {
              setTransactions(transactionsRes.data);
            }

            if (vaultRes.success && vaultRes.data) {
              setVaultFiles(vaultRes.data.files || []);
            }
          } catch (error) {
            console.error("Failed to fetch search data:", error);
          } finally {
            setIsFetching(false);
          }
        };

        fetchData();
      }
    }, debounceDelay);

    return () => clearTimeout(handler);
  }, [isOpen, debouncedSearch, debounceDelay]);

  const onSelect = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  const filteredShortcuts = SHORTCUTS.filter((s) =>
    s.label.toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  const filteredSettings = SETTINGS_ITEMS.filter((s) =>
    s.label.toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  const hasResults =
    filteredShortcuts.length > 0 ||
    filteredSettings.length > 0 ||
    transactions.length > 0 ||
    vaultFiles.length > 0;

  return (
    <>
      <Button
        variant="ghost"
        className="relative h-9 w-full justify-start text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-40 lg:w-64 hover:bg-transparent px-0"
        onClick={() => setOpen(true)}
      >
        <span className="inline-flex items-center">
          <Icons.Search className="mr-2 h-4 w-4" />
          Find anything...
        </span>
        <Kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-6 select-none items-center gap-1 px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span>⌘</span>K
        </Kbd>
      </Button>

      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent
          className="overflow-hidden p-0 max-w-full w-full md:max-w-[740px] h-[535px] m-0 select-text border-none shadow-2xl flex flex-col bg-background/80 backdrop-blur-xl"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Search for transactions, vault files, and more.
          </DialogDescription>
          <Command
            shouldFilter={false}
            className="rounded-t-xl border-none flex-1 bg-transparent"
          >
            <div className="border-b border-border relative">
              <CommandInput
                placeholder="Type a command or search..."
                onValueChange={(value: string) => {
                  setDebouncedSearch(value);

                  // If the search term is longer than 1 word, increase the debounce delay
                  if (value.trim().split(/\s+/).length > 1) {
                    setDebounceDelay(700);
                  } else {
                    setDebounceDelay(200);
                  }
                }}
                className="h-14 px-5 border-none"
              />
              {isFetching && (
                <div className="absolute bottom-0 h-0.5 w-full overflow-hidden z-50">
                  <div className="absolute inset-0 h-full w-40 animate-slide-effect bg-linear-to-r dark:from-transparent dark:via-white dark:to-transparent from-transparent via-black to-transparent opacity-50" />
                </div>
              )}
            </div>
            <CommandList className="max-h-full h-full pb-2 scrollbar-thin scrollbar-thumb-muted-foreground/20">
              {!hasResults && !isFetching && (
                <CommandEmpty>No results found.</CommandEmpty>
              )}

              {filteredShortcuts.length > 0 && (
                <CommandGroup
                  heading="Shortcuts"
                  className="px-2 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground"
                >
                  {filteredShortcuts.map((shortcut) => (
                    <CommandItem
                      key={shortcut.href}
                      onSelect={() => onSelect(shortcut.href)}
                      className="px-3 py-2.5  cursor-pointer"
                    >
                      <shortcut.icon
                        size={16}
                        className="mr-3 text-muted-foreground"
                      />
                      <span className="text-sm">{shortcut.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {transactions.length > 0 && (
                <CommandGroup
                  heading="Transactions"
                  className="px-2 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground"
                >
                  {transactions.map((transaction) => {
                    const isIncome = transaction.type === "income";
                    const isExpense = transaction.type === "expense";
                    const amount = Number(transaction.amount);

                    return (
                      <CommandItem
                        key={transaction.id}
                        onSelect={() => onSelect("/en/transactions")}
                        className="px-3 py-2.5 rounded-md cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center">
                          <Icons.Transactions
                            size={16}
                            className="mr-3 text-muted-foreground"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm truncate max-w-[150px] md:max-w-[350px]">
                              {transaction.name ||
                                transaction.description ||
                                transaction.category?.name ||
                                "Transaction"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {format(
                                new Date(transaction.date),
                                "MMM dd, yyyy",
                              )}
                            </span>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "text-sm font-medium font-serif",
                            isIncome
                              ? "text-emerald-500"
                              : isExpense
                                ? "text-red-500"
                                : "text-blue-500",
                          )}
                        >
                          {formatCurrency(amount)}
                        </span>
                      </CommandItem>
                    );
                  })}
                  <CommandItem
                    onSelect={() => onSelect("/en/transactions")}
                    className="px-3 py-2.5 rounded-md cursor-pointer text-muted-foreground"
                  >
                    <Icons.Settings size={14} className="mr-3 ml-0.5" />
                    <span className="text-xs">View transactions</span>
                  </CommandItem>
                </CommandGroup>
              )}

              {vaultFiles.length > 0 && (
                <CommandGroup
                  heading="Vault"
                  className="px-2 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground"
                >
                  {vaultFiles.map((file) => (
                    <CommandItem
                      key={file.id}
                      onSelect={() => onSelect("/en/vault")}
                      className="px-3 py-2.5 rounded-md cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center">
                        <Icons.Vault
                          size={16}
                          className="mr-3 text-muted-foreground"
                        />
                        <span className="text-sm truncate max-w-[200px] md:max-w-[400px]">
                          {file.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground uppercase">
                        {formatBytes(file.size)}
                      </span>
                    </CommandItem>
                  ))}
                  <CommandItem
                    onSelect={() => onSelect("/en/vault")}
                    className="px-3 py-2.5 rounded-md cursor-pointer text-muted-foreground"
                  >
                    <Icons.Settings size={14} className="mr-3 ml-0.5" />
                    <span className="text-xs">View vault</span>
                  </CommandItem>
                </CommandGroup>
              )}

              {filteredSettings.length > 0 && (
                <CommandGroup
                  heading="Settings"
                  className="px-2 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground"
                >
                  {filteredSettings.map((item) => (
                    <CommandItem
                      key={item.href}
                      onSelect={() => onSelect(item.href)}
                      className="px-3 py-2.5  cursor-pointer"
                    >
                      <item.icon
                        size={16}
                        className="mr-3 text-muted-foreground"
                      />
                      <span className="text-sm">{item.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>

          <footer className="search-footer flex px-4 h-11 w-full border-t border-border/50 items-center bg-muted/30 backdrop-blur-xl">
            <div></div>

            <div className="ml-auto flex items-center space-x-2">
              <div className="flex items-center gap-1.5">
                <div className="size-5 select-none items-center border border-border/50 bg-background flex justify-center rounded-[4px] shadow-sm">
                  <Icons.ChevronUp
                    size={10}
                    className="text-muted-foreground"
                  />
                </div>
                <div className="size-5 select-none items-center border border-border/50 bg-background flex justify-center rounded-[4px] shadow-sm">
                  <Icons.ChevronDown
                    size={10}
                    className="text-muted-foreground"
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                  Navigate
                </span>
              </div>

              <div className="h-4 w-px bg-border/50 mx-1" />

              <div className="flex items-center gap-1.5">
                <div className="size-5 select-none items-center border border-border/50 bg-background flex justify-center rounded-[4px] shadow-sm">
                  <Icons.SubdirectoryArrowLeft
                    size={10}
                    className="text-muted-foreground"
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                  Open
                </span>
              </div>
            </div>
          </footer>
        </DialogContent>
      </Dialog>
    </>
  );
}
