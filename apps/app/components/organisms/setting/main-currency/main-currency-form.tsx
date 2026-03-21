"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
} from "@workspace/ui";
import { toast } from "sonner";
import { updateTransactionSettings } from "@workspace/modules/setting/setting.action";
import type { TransactionSettings } from "@workspace/types";
import { CurrencySelector } from "../currency-selector";
import { useAppStore } from "@/stores/app";

interface MainCurrencyFormProps {
  settings: TransactionSettings;
  dictionary: any;
}

function MainCurrencySkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Separator className="my-6" />
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-8 w-24 rounded-none" />
      </div>
      <Separator />
      <div className="space-y-4 max-w-sm mx-auto">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32 rounded-none" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32 rounded-none" />
        </div>
      </div>
    </div>
  );
}

export function MainCurrencyForm({
  settings,
  dictionary,
}: MainCurrencyFormProps) {
  const [data, setData] = useState(settings);
  const [isPending, startTransition] = useTransition();
  const { isLoading } = useAppStore();

  if (isLoading) return <MainCurrencySkeleton />;
  if (!data) return null;

  const handleUpdate = (updates: Partial<TransactionSettings>) => {
    // Optimistic update
    setData((prev) => ({ ...prev, ...updates }));

    startTransition(async () => {
      const result = await updateTransactionSettings({
        ...data,
        ...updates,
      });
      if (result.success) {
        toast.success(dict.toast_updated || "Main currency settings updated");
      } else {
        toast.error(result.error);
        // Revert on error
        setData(settings);
      }
    });
  };

  const formatPreview = () => {
    const amount = (1).toFixed(data.mainCurrencyDecimalPlaces);
    if (data.mainCurrencySymbolPosition === "Front") {
      return `${data.mainCurrencySymbol} ${amount}`;
    }
    return `${amount} ${data.mainCurrencySymbol}`;
  };

  const dict = dictionary.settings.currency;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium">{dict.title}</h3>
        <p className="text-sm text-muted-foreground">{dict.description}</p>
      </div>
      <Separator className="my-6" />

      <div className="flex flex-col items-center justify-center py-8 space-y-2">
        <p className="text-sm text-muted-foreground uppercase tracking-widest">
          {data.mainCurrencyCode} - {dict.label} ({data.mainCurrencySymbol})
        </p>
        <p className="text-4xl font-semibold">{formatPreview()}</p>
        <div className="pt-4">
          <CurrencySelector
            onSelect={(c) => {
              handleUpdate({
                mainCurrencyCode: c.code,
                mainCurrencySymbol: c.symbol,
              });
            }}
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="rounded-none h-8 text-xs"
              >
                {dictionary?.settings?.common?.change || "Change"}
              </Button>
            }
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-4 max-w-sm mx-auto">
        <div className="flex items-center justify-between">
          <Label className="text-sm">{dict.unit_position}</Label>
          <Select
            value={data.mainCurrencySymbolPosition}
            onValueChange={(v: "Front" | "Back") =>
              handleUpdate({ mainCurrencySymbolPosition: v })
            }
          >
            <SelectTrigger className="w-[120px] rounded-none h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="Front">{dict.positions?.Front || "Front"}</SelectItem>
              <SelectItem value="Back">{dict.positions?.Back || "Back"}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-sm">{dict.decimal_point}</Label>
          <Select
            value={data.mainCurrencyDecimalPlaces.toString()}
            onValueChange={(v) =>
              handleUpdate({ mainCurrencyDecimalPlaces: parseInt(v) })
            }
          >
            <SelectTrigger className="w-[120px] rounded-none h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="0">0</SelectItem>
              <SelectItem value="1">1.0</SelectItem>
              <SelectItem value="2">1.00</SelectItem>
              <SelectItem value="3">1.000</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
