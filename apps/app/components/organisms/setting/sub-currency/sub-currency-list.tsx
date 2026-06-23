"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { addSubCurrency, getExchangeRates, removeSubCurrency } from "@workspace/modules/setting/setting.action";
import type { SubCurrency } from "@workspace/types";
import { Button, DataTableEmptyState, SelectCurrency, Separator, Skeleton } from "@workspace/ui";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { AppDictionary } from "@/modules/types/dictionary";
import { useAppStore } from "@/stores/app";

interface SubCurrencyListProps {
  dictionary: AppDictionary;
}

function SubCurrencySkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Separator className="my-6" />
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="flex justify-between rounded-none border p-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-8 rounded-none" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SubCurrencyList({ dictionary }: SubCurrencyListProps) {
  const settings = useAppStore((s) => s.settings);
  const subCurrencies = useAppStore((s) => s.subCurrencies);
  const setSubCurrencies = useAppStore((s) => s.setSubCurrencies);
  const queryClient = useQueryClient();

  const [rates, setRates] = useState<Record<string, string>>({});
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fetchRates = useCallback(async () => {
    if (!settings?.mainCurrencyCode) return;
    setIsLoadingRates(true);
    try {
      const result = await getExchangeRates(settings.mainCurrencyCode);
      if (result.success) {
        setRates(result.data || {});
      } else {
        console.error("Failed to fetch rates", result.error);
      }
    } catch (error) {
      console.error("Failed to fetch rates", error);
    } finally {
      setIsLoadingRates(false);
    }
  }, [settings?.mainCurrencyCode]);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  const syncStoreAndCache = useCallback(
    (next: SubCurrency[]) => {
      setSubCurrencies(next);
      queryClient.setQueryData(["settings", "sub-currencies"], next);
    },
    [setSubCurrencies, queryClient],
  );

  const handleAdd = (c: { code: string }) => {
    startTransition(async () => {
      const result = await addSubCurrency({ currencyCode: c.code });
      if (result.success) {
        syncStoreAndCache([...subCurrencies, result.data]);
        const template = dictionary.settings.sub_currencies.toast_added || "{code} added to sub-currencies";
        toast.success(template.replace("{code}", c.code));
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleRemove = (id: string, code: string) => {
    startTransition(async () => {
      const result = await removeSubCurrency(id);
      if (result.success) {
        syncStoreAndCache(subCurrencies.filter((item) => item.id !== id));
        const template = dictionary.settings.sub_currencies.toast_removed || "{code} removed";
        toast.success(template.replace("{code}", code));
      } else {
        toast.error(result.error);
      }
    });
  };

  if (!settings) return <SubCurrencySkeleton />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-lg">{dictionary.settings.sub_currencies.title}</h3>
          <p className="text-muted-foreground text-sm">{dictionary.settings.sub_currencies.description}</p>
        </div>
        <SelectCurrency
          onSelect={handleAdd}
          trigger={
            <Button size="sm" className="h-8 w-30 gap-2 rounded-none text-xs">
              <Plus className="h-4 w-4" />
              {dictionary.settings.sub_currencies.add_button}
            </Button>
          }
        />
      </div>
      <Separator className="my-6" />

      <div className="grid gap-4">
        {subCurrencies.map((sc) => {
          const rate = rates[sc.currencyCode];
          const rateNum = rate ? parseFloat(rate) : null;
          // rates[sc.code] = how many `sc` you get for 1 main, e.g. 1 IDR = 0.0000613 USD.
          // Inverse: 1 sc = X main, e.g. 1 USD = 16,302 IDR.
          const inverseNum = rateNum && rateNum > 0 ? 1 / rateNum : null;
          // Choose enough precision to be meaningful for both very small and very
          // large rates. Significant digits work better than fixed fraction digits
          // here (0.00006135 vs. 16,302.45).
          const fmt = (n: number) =>
            n.toLocaleString(undefined, { maximumSignificantDigits: 6 });
          return (
            <div key={sc.id} className="flex items-center justify-between rounded-none border p-4">
              <div className="flex flex-col">
                <span className="font-semibold text-lg">{sc.currencyCode}</span>
                <span className="text-muted-foreground text-xs uppercase">
                  {dictionary.settings.sub_currencies.workspace_currency}
                </span>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  {isLoadingRates ? (
                    <Loader2 className="h-4 w-4 animate-spin opacity-50" />
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-sm tabular-nums">
                        1 {settings.mainCurrencyCode} = {rateNum ? fmt(rateNum) : "---"} {sc.currencyCode}
                      </span>
                      <span className="font-medium text-sm tabular-nums">
                        1 {sc.currencyCode} = {inverseNum ? fmt(inverseNum) : "---"} {settings.mainCurrencyCode}
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase">
                        {dictionary.settings.sub_currencies.rate_now}
                      </span>
                    </div>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-none text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => handleRemove(sc.id, sc.currencyCode)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}

        {subCurrencies.length === 0 && (
          <DataTableEmptyState
            title={dictionary.settings.sub_currencies.no_sub_currencies || "No sub-currencies"}
            description={
              dictionary.settings.sub_currencies.description || "Add sub-currencies to manage exchange rates."
            }
            className="rounded-none border-2 border-accent border-dashed"
          />
        )}
      </div>
    </div>
  );
}
