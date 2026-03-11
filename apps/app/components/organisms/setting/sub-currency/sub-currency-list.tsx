"use client";

import { useEffect, useState, useTransition } from "react";

import { Button, Card, CardContent } from "@workspace/ui";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { addSubCurrency, getExchangeRates, getSubCurrencies, removeSubCurrency } from "@workspace/modules/setting/setting.action";
import type { SubCurrency, TransactionSettings } from "@workspace/types";

import { CurrencySelector } from "../currency-selector";

interface SubCurrencyListProps {
  initialSubCurrencies: SubCurrency[];
  settings: TransactionSettings;
  dictionary: any;
}

export function SubCurrencyList({ initialSubCurrencies, settings, dictionary }: SubCurrencyListProps) {
  const [subCurrencies, setSubCurrencies] = useState(initialSubCurrencies);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fetchRates = async () => {
    if (!settings?.mainCurrencyCode) return;
    setIsLoadingRates(true);
    try {
      const result = await getExchangeRates(settings.mainCurrencyCode);
      if (result.success) {
        setRates(result.data || {});
      } else {
        console.error("Failed to fetch rates:", result.error);
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
        toast.success(`${c.code} added to sub-currencies`);
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
        toast.success(`${code} removed`);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Sub Currencies</h3>
          <p className="text-sm text-muted-foreground">Manage secondary currencies for your workspace.</p>
        </div>
        <CurrencySelector
          onSelect={handleAdd}
          trigger={
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Add Currency
            </Button>
          }
        />
      </div>

      <div className="grid gap-4">
        {subCurrencies.map((sc) => (
          <Card key={sc.id} className="overflow-hidden border-none shadow-sm bg-accent/50">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-semibold text-lg">{sc.currencyCode}</span>
                <span className="text-xs text-muted-foreground uppercase">Workspace Currency</span>
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
                          ? parseFloat(rates[sc.currencyCode]!).toLocaleString(undefined, { maximumFractionDigits: 4 })
                          : "---"}{" "}
                        {sc.currencyCode}
                      </span>
                      <span className="text-[10px] text-muted-foreground">RATE NOW</span>
                    </div>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => handleRemove(sc.id, sc.currencyCode)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {subCurrencies.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed rounded-xl border-accent">
            <p className="text-muted-foreground">No sub-currencies added yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
