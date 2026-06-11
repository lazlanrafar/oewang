"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import { addSubCurrency, getExchangeRates, removeSubCurrency } from "@workspace/modules/setting/setting.action";
import type { SubCurrency, TransactionSettings } from "@workspace/types";
import { Button, DataTableEmptyState, SelectCurrency, Separator, Skeleton } from "@workspace/ui";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { AppDictionary } from "@/modules/types/dictionary";
import { useAppStore } from "@/stores/app";

interface SubCurrencyListProps {
  initialSubCurrencies: SubCurrency[];
  settings: TransactionSettings;
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
      <div className="flex justify-end">
        <Skeleton className="h-8 w-32 rounded-none" />
      </div>
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="flex justify-between rounded-none border p-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="flex gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-2 w-12" />
              </div>
              <Skeleton className="h-8 w-8 rounded-none" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SubCurrencyList({ initialSubCurrencies, settings, dictionary }: SubCurrencyListProps) {
  const [subCurrencies, setSubCurrencies] = useState(initialSubCurrencies);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { isLoading: isAppLoading } = useAppStore();

  const fetchRates = useCallback(async () => {
    if (!settings?.mainCurrencyCode) return;
    setIsLoadingRates(true);
    try {
      const result = await getExchangeRates(settings?.mainCurrencyCode);
      if (result.success) {
        setRates(result.data || {});
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

  const handleAdd = (c: { code: string }) => {
    startTransition(async () => {
      const result = await addSubCurrency({ currencyCode: c.code });
      if (result.success) {
        setSubCurrencies((prev) => [...prev, result.data]);
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
        setSubCurrencies((prev) => prev.filter((item) => item.id !== id));
        const template = dictionary.settings.sub_currencies.toast_removed || "{code} removed";
        toast.success(template.replace("{code}", code));
      } else {
        toast.error(result.error);
      }
    });
  };

  if (!dictionary && isAppLoading) return <SubCurrencySkeleton />;

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
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">
                        1 {settings?.mainCurrencyCode} ={" "}
                        {rate
                          ? parseFloat(rate).toLocaleString(undefined, {
                              maximumFractionDigits: 4,
                            })
                          : "---"}{" "}
                        {sc.currencyCode}
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
