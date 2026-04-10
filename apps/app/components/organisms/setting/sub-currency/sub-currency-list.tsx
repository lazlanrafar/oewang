"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Separator, Skeleton, SelectCurrency } from "@workspace/ui";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addSubCurrency,
  getExchangeRates,
  removeSubCurrency,
} from "@workspace/modules/setting/setting.action";
import type { SubCurrency, TransactionSettings } from "@workspace/types";
import { useAppStore } from "@/stores/app";
import { DataTableEmptyState } from "@workspace/ui";

interface SubCurrencyListProps {
  initialSubCurrencies: SubCurrency[];
  settings: TransactionSettings;
  dictionary: any;
}

function SubCurrencySkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
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
          <div key={i} className="border rounded-none p-4 flex justify-between">
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

export function SubCurrencyList({
  initialSubCurrencies,
  settings,
  dictionary,
}: SubCurrencyListProps) {
  const [subCurrencies, setSubCurrencies] = useState(initialSubCurrencies);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { isLoading: isAppLoading } = useAppStore();

  const fetchRates = async () => {
    if (!settings?.mainCurrencyCode) return;
    setIsLoadingRates(true);
    try {
      const result = await getExchangeRates(settings.mainCurrencyCode);
      if (result.success) {
        setRates(result.data || {});
      }
    } catch (error) {
      console.error("Failed to fetch rates", error);
    } finally {
      setIsLoadingRates(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, [settings?.mainCurrencyCode]);

  const handleAdd = (c: { code: string }) => {
    startTransition(async () => {
      const result = await addSubCurrency({ currencyCode: c.code });
      if (result.success) {
        setSubCurrencies((prev) => [...prev, result.data]);
        toast.success(
          `${c.code} ${
            dictionary?.settings.sub_currencies.toast_added ||
            "added to sub-currencies"
          }`,
        );
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
        toast.success(
          `${code} ${
            dictionary?.settings.sub_currencies.toast_removed || "removed"
          }`,
        );
      } else {
        toast.error(result.error);
      }
    });
  };

  if (isAppLoading) return <SubCurrencySkeleton />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">
            {dictionary?.settings.sub_currencies.title}
          </h3>
          <p className="text-sm text-muted-foreground">
            {dictionary?.settings.sub_currencies.description}
          </p>
        </div>
        <SelectCurrency
          onSelect={handleAdd}
          trigger={
            <Button size="sm" className="rounded-none h-8 text-xs gap-2 w-30">
              <Plus className="h-4 w-4" />
              {dictionary?.settings.sub_currencies.add_button}
            </Button>
          }
        />
      </div>
      <Separator className="my-6" />

      <div className="grid gap-4">
        {subCurrencies.map((sc) => (
          <div
            key={sc.id}
            className="border rounded-none p-4 flex items-center justify-between"
          >
            <div className="flex flex-col">
              <span className="font-semibold text-lg">{sc.currencyCode}</span>
              <span className="text-xs text-muted-foreground uppercase">
                {dictionary?.settings.sub_currencies.workspace_currency}
              </span>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                {isLoadingRates ? (
                  <Loader2 className="h-4 w-4 animate-spin opacity-50" />
                ) : (
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      1 {settings.mainCurrencyCode} ={" "}
                      {rates[sc.currencyCode]
                        ? parseFloat(rates[sc.currencyCode]!).toLocaleString(
                            undefined,
                            { maximumFractionDigits: 4 },
                          )
                        : "---"}{" "}
                      {sc.currencyCode}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase">
                      {dictionary?.settings.sub_currencies.rate_now}
                    </span>
                  </div>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive transition-colors rounded-none"
                onClick={() => handleRemove(sc.id, sc.currencyCode)}
                disabled={isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {subCurrencies.length === 0 && (
          <DataTableEmptyState
            title={dictionary?.settings.sub_currencies.no_sub_currencies || "No sub-currencies"}
            description={dictionary?.settings.sub_currencies.description || "Add sub-currencies to manage exchange rates."}
            action={{
              label: dictionary?.settings.sub_currencies.add_button || "Add currency",
              onClick: () => {
                // The trigger is a SelectCurrency component which is already in the header
                // and clicking this button won't easily open it without more complex state management
                // but let's just make it look good.
              }
            }}
            className="border-2 border-dashed rounded-none border-accent py-12"
          />
        )}
      </div>
    </div>
  );
}
