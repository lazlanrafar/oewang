"use client";

import {
  Sheet,
  SheetContent,
  Button,
  Separator,
  Label,
  Switch,
  CurrencyInput,
  Input,
} from "@workspace/ui";
import type { Wallet } from "@workspace/types";
import {
  Landmark,
  CheckCircle2,
  Pencil,
  XCircle,
  Layers,
  X,
} from "lucide-react";
import { useAppStore } from "@/stores/app";
import { useState, useEffect } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { updateWallet } from "@workspace/modules/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SelectAccountGroup } from "@/components/molecules/select-account-group";
import { format } from "date-fns";

interface AccountDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet?: Wallet;
  groups?: any[];
  onEdit: () => void;
}

export function AccountDetailSheet({
  open,
  onOpenChange,
  wallet,
  groups = [],
  onEdit,
}: AccountDetailSheetProps) {
  const { settings, formatCurrency, dictionary } = useAppStore();
  const [name, setName] = useState("");
  const [balance, setBalance] = useState(0);
  const [isIncludedInTotals, setIsIncludedInTotals] = useState(true);
  const [isEditingBalance, setIsEditingBalance] = useState(false);

  const debouncedName = useDebounce(name, 500);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (wallet) {
      setName(wallet.name || "");
      setBalance(Number(wallet.balance) || 0);
      setIsIncludedInTotals(wallet.isIncludedInTotals ?? true);
    }
  }, [wallet?.id]);

  const updateWalletInCache = (updatedData: Partial<Wallet>) => {
    if (!wallet?.id) return;
    queryClient.setQueriesData({ queryKey: ["wallets"] }, (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          data: page.data.map((w: any) =>
            w.id === wallet.id ? { ...w, ...updatedData } : w,
          ),
        })),
      };
    });
  };

  // Real-time update for Name
  useEffect(() => {
    if (!wallet || !dictionary) return;

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
  }, [debouncedName, wallet?.id, dictionary]);

  if (!wallet || !dictionary) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col h-full p-0">
        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8 pb-32">
          {/* Header Bar */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
              <Landmark className="h-3 w-3 text-muted-foreground/60" />
              <span>{dictionary.accounts.title}</span>
            </div>
            <span className="text-[11px] text-muted-foreground tracking-tight">
              {dictionary.accounts.updated}{" "}
              {format(new Date(wallet.updatedAt), "MMM d, yyyy")}
            </span>
          </div>

          {/* Amount / Balance */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-start gap-3 pt-1">
              {isEditingBalance ? (
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-serif font-medium text-foreground/90">
                    {settings?.mainCurrencySymbol}
                  </span>
                  <CurrencyInput
                    value={balance}
                    onChange={(val) => setBalance(val)}
                    currencySymbol={settings?.mainCurrencySymbol}
                    decimalPlaces={settings?.mainCurrencyDecimalPlaces}
                    className="text-5xl tracking-tighter font-medium font-serif bg-transparent border-none p-0 h-auto focus:ring-0 w-full"
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
                <h1
                  className="text-5xl tracking-tighter font-medium font-serif cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setIsEditingBalance(true)}
                >
                  {formatCurrency(Number(wallet.balance))}
                </h1>
              )}
            </div>
          </div>

          {/* Inline Selection Grid */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest px-1">
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
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest px-1">
                {dictionary.transactions.type_label}
              </Label>
              <div className="flex items-center justify-between border px-3 h-10 bg-background/50">
                <span className="text-[11px] font-medium">
                  {dictionary.accounts.include_in_totals_label}
                </span>
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
                        checked
                          ? dictionary.accounts.included_in_totals
                          : dictionary.accounts.excluded_from_totals,
                      );
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Name Input Row */}
          <div className="space-y-2">
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest px-1">
              {dictionary.accounts.account_name}
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={dictionary.accounts.account_name_placeholder}
              className="font-sans font-medium"
            />
          </div>

          <Separator className="bg-border" />

          {/* Additional Info Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between group">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground/90 group-hover:text-foreground transition-colors cursor-pointer">
                  {dictionary.accounts.created_date}
                </Label>
                <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[280px]">
                  {dictionary.accounts.created_date_description}
                </p>
              </div>
              <span className="text-[11px] font-medium">
                {format(new Date(wallet.createdAt), "MMMM d, yyyy")}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Toolbar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] bg-background/70 backdrop-blur-xl border px-4 py-1 flex items-center justify-between z-50 shadow-2xl shadow-black/20">
          <div className="flex items-center gap-4">
            {/* Future account actions could go here */}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="px-3 py-2 hover:bg-muted/40 transition-colors group"
            >
              <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground uppercase tracking-widest">
                {dictionary.transactions.esc}
              </span>
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
