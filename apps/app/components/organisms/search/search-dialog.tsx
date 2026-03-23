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
import { useLocalizedRoute } from "@/utils/localized-route";


export function SearchDialog() {
  const { isOpen, setOpen } = useSearchStore();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [vaultFiles, setVaultFiles] = useState<VaultFile[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [debounceDelay, setDebounceDelay] = useState(200);
  const [isFetching, setIsFetching] = useState(false);
  const { settings, formatCurrency, dictionary } = useAppStore();
  const { getLocalizedUrl } = useLocalizedRoute();


  const t = (key: string) => {
    if (!key || !key.includes(".") || !dictionary) return key;
    const keys = key.split(".");
    let result: any = dictionary;
    for (const k of keys) {
      if (!result?.[k]) return key;
      result = result[k];
    }
    return typeof result === "string" ? result : key;
  };

  const SHORTCUTS = [
    { label: t("sidebar.overview"), icon: Icons.Overview, href: getLocalizedUrl("/overview") },
    {
      label: t("sidebar.transactions"),
      icon: Icons.Transactions,
      href: getLocalizedUrl("/transactions"),
    },
    { label: t("sidebar.calendar"), icon: Icons.CalendarMonth, href: getLocalizedUrl("/calendar") },
    { label: t("sidebar.accounts"), icon: Icons.Accounts, href: getLocalizedUrl("/accounts") },
    { label: t("sidebar.debts"), icon: Icons.Currency, href: getLocalizedUrl("/debts") },
    { label: t("sidebar.contacts"), icon: Icons.Customers, href: getLocalizedUrl("/contacts") },
    { label: t("sidebar.vault"), icon: Icons.Vault, href: getLocalizedUrl("/vault") },
  ];

  const SETTINGS_ITEMS = [
    {
      label: t("settings.account.title"),
      icon: Icons.Settings,
      href: getLocalizedUrl("/settings/profile"),
    },
    {
      label: t("settings.appearance.title"),
      icon: Icons.Settings,
      href: getLocalizedUrl("/settings/appearance"),
    },
  ];

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
    String(s.label || "").toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  const filteredSettings = SETTINGS_ITEMS.filter((s) =>
    String(s.label || "").toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  const hasResults =
    filteredShortcuts.length > 0 ||
    filteredSettings.length > 0 ||
    transactions.length > 0 ||
    vaultFiles.length > 0;

  if (!dictionary) return null;

  return (
    <>
      <Button
        variant="ghost"
        className="relative h-9 w-full justify-start text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-40 lg:w-64 hover:bg-transparent px-0"
        onClick={() => setOpen(true)}
      >
        <span className="inline-flex items-center">
          <Icons.Search className="mr-2 h-4 w-4" />
          {t("search.placeholder")}
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
          <DialogTitle className="sr-only">{t("search.shortcuts")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("search.input_placeholder")}
          </DialogDescription>
          <Command
            shouldFilter={false}
            className="rounded-t-xl border-none flex-1 bg-transparent"
          >
            <div className="border-b border-border relative">
              <CommandInput
                placeholder={t("search.input_placeholder")}
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
                <CommandEmpty>{t("search.no_results")}</CommandEmpty>
              )}

              {filteredShortcuts.length > 0 && (
                <CommandGroup
                  heading={t("search.shortcuts")}
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
                  heading={t("search.transactions")}
                  className="px-2 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground"
                >
                  {transactions.map((transaction) => {
                    const isIncome = transaction.type === "income";
                    const isExpense = transaction.type === "expense";
                    const amount = Number(transaction.amount);

                    return (
                      <CommandItem
                        key={transaction.id}
                        onSelect={() => onSelect(getLocalizedUrl("/transactions"))}
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
                    onSelect={() => onSelect(getLocalizedUrl("/transactions"))}
                    className="px-3 py-2.5 rounded-md cursor-pointer text-muted-foreground"
                  >
                    <Icons.Settings size={14} className="mr-3 ml-0.5" />
                    <span className="text-xs">{t("search.view_transactions")}</span>
                  </CommandItem>
                </CommandGroup>
              )}

              {vaultFiles.length > 0 && (
                <CommandGroup
                  heading={t("search.vault")}
                  className="px-2 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground"
                >
                  {vaultFiles.map((file) => (
                    <CommandItem
                      key={file.id}
                      onSelect={() => onSelect(getLocalizedUrl("/vault"))}
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
                    onSelect={() => onSelect(getLocalizedUrl("/vault"))}
                    className="px-3 py-2.5 rounded-md cursor-pointer text-muted-foreground"
                  >
                    <Icons.Settings size={14} className="mr-3 ml-0.5" />
                    <span className="text-xs">{t("search.view_vault")}</span>
                  </CommandItem>
                </CommandGroup>
              )}

              {filteredSettings.length > 0 && (
                <CommandGroup
                  heading={t("search.settings")}
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
                  {t("search.navigate")}
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
                  {t("search.open")}
                </span>
              </div>
            </div>
          </footer>
        </DialogContent>
      </Dialog>
    </>
  );
}
