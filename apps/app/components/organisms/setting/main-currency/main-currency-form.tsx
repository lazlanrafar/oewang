"use client";

import { useState, useTransition } from "react";

import { useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { updateTransactionSettings } from "@workspace/modules/setting/setting.action";
import type { TransactionSettings } from "@workspace/types";
import { getCurrencyDisplayUnit } from "@workspace/utils";
import { useAppStore } from "@/stores/app";
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectCurrency,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
} from "@workspace/ui";
import { toast } from "sonner";

interface MainCurrencyFormProps {
  settings: TransactionSettings;
  dictionary: Dictionary;
}

function _MainCurrencySkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Separator className="my-6" />
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-8 w-24 rounded-none" />
      </div>
      <Separator />
      <div className="mx-auto max-w-sm space-y-4">
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
  const [_isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const setAppSettings = useAppStore((s) => s.setSettings);

  if (!data) return null;

  const handleUpdate = (updates: Partial<TransactionSettings>) => {
    const optimistic = { ...data, ...updates };
    // Optimistic local update
    setData(optimistic);

    startTransition(async () => {
      const result = await updateTransactionSettings(optimistic);
      if (result.success && result.data) {
        // Sync Zustand and TanStack cache so formatCurrency updates everywhere
        setAppSettings(result.data);
        queryClient.setQueryData(["settings", "transaction"], result.data);
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
    const currencyUnit = getCurrencyDisplayUnit(
      data.mainCurrencyCode,
      data.mainCurrencySymbol,
    );
    if (data.mainCurrencySymbolPosition === "Front") {
      return `${currencyUnit} ${amount}`;
    }
    return `${amount} ${currencyUnit}`;
  };

  const dict = dictionary.settings.currency;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-medium text-lg">{dict.title}</h3>
        <p className="text-muted-foreground text-sm">{dict.description}</p>
      </div>
      <Separator className="my-6" />

      <div className="flex flex-col items-center justify-center space-y-2 py-8">
        <p className="text-muted-foreground text-sm uppercase tracking-widest font-serif">
          {data.mainCurrencyCode} - {dict.label} ({data.mainCurrencySymbol})
        </p>
        <p className="text-4xl font-serif">{formatPreview()}</p>
        <div className="pt-4">
          <SelectCurrency
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
                className="h-8 rounded-none text-xs"
              >
                {dictionary.settings.common.change || "Change"}
              </Button>
            }
          />
        </div>
      </div>

      <Separator />

      <div className="mx-auto max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm">{dict.unit_position}</Label>
          <Select
            value={data.mainCurrencySymbolPosition}
            onValueChange={(v: "Front" | "Back") =>
              handleUpdate({ mainCurrencySymbolPosition: v })
            }
          >
            <SelectTrigger className="h-8 w-[120px] rounded-none text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="Front">
                {dict.positions.Front || "Front"}
              </SelectItem>
              <SelectItem value="Back">
                {dict.positions.Back || "Back"}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-sm">{dict.decimal_point}</Label>
          <Select
            value={data.mainCurrencyDecimalPlaces.toString()}
            onValueChange={(v) =>
              handleUpdate({ mainCurrencyDecimalPlaces: parseInt(v, 10) })
            }
          >
            <SelectTrigger className="h-8 w-[120px] rounded-none text-xs">
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
