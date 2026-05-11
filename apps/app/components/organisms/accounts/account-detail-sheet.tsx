"use client";

import { useCallback, useEffect, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { updateWallet } from "@workspace/modules/client";
import type { Wallet } from "@workspace/types";
import { CurrencyInput, Input, Label, Separator, Sheet, SheetContent, Switch } from "@workspace/ui";
import { getCurrencyDisplayUnit } from "@workspace/utils";
import { format } from "date-fns";
import { Landmark } from "lucide-react";
import { toast } from "sonner";

import { SelectAccountGroup } from "@/components/molecules/select-account-group";
import { useDebounce } from "@/hooks/use-debounce";
import { useAppStore } from "@/stores/app";

interface AccountDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletId?: string;
  onEdit?: (wallet: Wallet) => void;
  onDelete?: (wallet: Wallet) => void;
  dictionary: Dictionary;
  locale?: string;
}

export function AccountDetailSheet({
  open,
  onOpenChange,
  walletId,
  dictionary,
  locale = "en-US",
}: AccountDetailSheetProps) {
  const [mounted, setMounted] = useState(false);
  const { settings, formatCurrency } = useAppStore();
  const currencyUnit = getCurrencyDisplayUnit(
    settings?.mainCurrencyCode,
    settings?.mainCurrencySymbol,
  );
  const [wallet, setWallet] = useState<Wallet | undefined>();
  const [name, setName] = useState("");
  const [balance, setBalance] = useState(0);
  const [isIncludedInTotals, setIsIncludedInTotals] = useState(true);
  const [isEditingBalance, setIsEditingBalance] = useState(false);

  const debouncedName = useDebounce(name, 500);
  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && walletId) {
      const fetchWallet = async () => {
        const { getWallet } = await import("@workspace/modules/client");
        const res = await getWallet(walletId);
        if (res.success && res.data) {
          setWallet(res.data as Wallet);
        }
      };
      fetchWallet();
    } else if (!open) {
      setWallet(undefined);
    }
  }, [open, walletId]);

  useEffect(() => {
    if (wallet) {
      setName(wallet.name || "");
      setBalance(Number(wallet.balance) || 0);
      setIsIncludedInTotals(wallet.isIncludedInTotals ?? true);
    }
  }, [wallet?.id, wallet?.balance, wallet?.isIncludedInTotals, wallet]);

  const updateWalletInCache = useCallback(
    (updatedData: Partial<Wallet>) => {
      if (!wallet?.id) return;
      queryClient.setQueriesData(
        { queryKey: ["wallets"] },
        (old: { pages?: Array<{ data: Wallet[] }> } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages?.map((page: { data: Wallet[] }) => ({
              ...page,
              data: page.data.map((w: Wallet) => (w.id === wallet.id ? { ...w, ...updatedData } : w)),
            })),
          };
        },
      );
    },
    [wallet?.id, queryClient],
  );

  // Real-time update for Name
  useEffect(() => {
    if (!wallet) return;

    if (debouncedName === wallet.name || debouncedName === "") return;

    const update = async () => {
      if (!wallet?.id) return;
      const res = await updateWallet(wallet.id, {
        name: debouncedName,
      });
      if (res.success) {
        updateWalletInCache({ name: debouncedName });
      }
    };

    update();
  }, [debouncedName, wallet?.id, updateWalletInCache, wallet]);

  if (!mounted || !wallet) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col p-0">
        <div className="no-scrollbar flex-1 space-y-8 overflow-y-auto p-6 pb-32">
          {/* Header Bar */}
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
              <Landmark className="h-3 w-3 text-muted-foreground/60" />
              <span>{dictionary.accounts.title}</span>
            </div>
            <span className="text-[11px] text-muted-foreground tracking-tight">
              {dictionary.accounts.updated}{" "}
              {wallet.updatedAt && !Number.isNaN(new Date(wallet.updatedAt).getTime())
                ? format(new Date(wallet.updatedAt), "MMM d, yyyy")
                : "N/A"}
            </span>
          </div>

          {/* Amount / Balance */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-start gap-3 pt-1">
              {isEditingBalance ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium font-serif text-3xl text-foreground/90">
                    {currencyUnit}
                  </span>
                  <CurrencyInput
                    value={balance}
                    onChange={(val) => setBalance(val)}
                    currencySymbol={settings?.mainCurrencySymbol}
                    decimalPlaces={settings?.mainCurrencyDecimalPlaces}
                    className="h-auto w-full border-none bg-transparent p-0 font-medium font-serif text-5xl tracking-tighter focus:ring-0"
                    autoFocus
                    onBlur={async () => {
                      setIsEditingBalance(false);
                      if (balance !== Number(wallet.balance)) {
                        const res = await updateWallet(wallet.id, {
                          balance: balance.toString(),
                        });
                        if (res.success && res.data) {
                          updateWalletInCache(res.data);
                          toast.success(dictionary.accounts.toasts.balance_updated);
                        }
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="cursor-pointer border-none bg-transparent p-0 font-medium font-serif text-5xl tracking-tighter transition-opacity hover:opacity-80"
                  onClick={() => setIsEditingBalance(true)}
                >
                  {formatCurrency(Number(wallet.balance), { locale })}
                </button>
              )}
            </div>
          </div>

          {/* Inline Selection Grid */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label className="px-1 font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                {dictionary.accounts.group_label}
              </Label>
              <SelectAccountGroup
                value={wallet.groupId || undefined}
                onChange={async (groupId) => {
                  const res = await updateWallet(wallet.id, {
                    groupId: groupId || null,
                  });
                  if (res.success && res.data) {
                    updateWalletInCache(res.data);
                    toast.success(dictionary.accounts.toasts.group_updated);
                  }
                }}
                className=""
                placeholder={dictionary.accounts.group_placeholder}
              />
            </div>
            <div className="space-y-2">
              <Label className="px-1 font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                {dictionary.transactions.type_label}
              </Label>
              <div className="flex h-10 items-center justify-between border bg-background/50 px-3">
                <span className="font-medium text-[11px]">{dictionary.accounts.include_in_totals_label}</span>
                <Switch
                  checked={isIncludedInTotals}
                  onCheckedChange={async (checked) => {
                    setIsIncludedInTotals(checked);
                    const res = await updateWallet(wallet.id, {
                      isIncludedInTotals: checked,
                    });
                    if (res.success && res.data) {
                      updateWalletInCache(res.data);
                      toast.success(
                        checked ? dictionary.accounts.included_in_totals : dictionary.accounts.excluded_from_totals,
                      );
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Name Input Row */}
          <div className="space-y-2">
            <Label className="px-1 font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
              {dictionary.accounts.account_name}
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={dictionary.accounts.account_name_placeholder}
              className="font-medium font-sans"
            />
          </div>

          <Separator className="bg-border" />

          {/* Additional Info Section */}
          <div className="space-y-4">
            <div className="group flex items-center justify-between">
              <div className="space-y-1">
                <Label className="cursor-pointer font-medium text-foreground/90 text-sm transition-colors group-hover:text-foreground">
                  {dictionary.accounts.created_date}
                </Label>
                <p className="max-w-[280px] text-[11px] text-muted-foreground leading-relaxed">
                  {dictionary.accounts.created_date_description}
                </p>
              </div>
              <span className="font-medium text-[11px]">{format(new Date(wallet.createdAt), "MMMM d, yyyy")}</span>
            </div>
          </div>
        </div>

        {/* Footer Toolbar */}
        <div className="-translate-x-1/2 absolute bottom-6 left-1/2 z-50 flex w-[calc(100%-3rem)] items-center justify-between border bg-background/70 px-4 py-1 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="flex items-center gap-4">{/* Future account actions could go here */}</div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="group px-3 py-2 transition-colors hover:bg-muted/40"
            >
              <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest group-hover:text-foreground">
                {dictionary.transactions.esc}
              </span>
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
