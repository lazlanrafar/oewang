"use client";

import { useState, useTransition } from "react";

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from "@workspace/ui";
import { toast } from "sonner";

import { updateTransactionSettings } from "@workspace/modules/setting/setting.action";
import type { TransactionSettings } from "@workspace/types";

import { CurrencySelector } from "../currency-selector";

interface MainCurrencyFormProps {
  settings: TransactionSettings;
  dictionary: any; // Keep any for now as dictionary structure is complex, but the import issue is fixed.
}

export function MainCurrencyForm({ settings, dictionary }: MainCurrencyFormProps) {
  const [data, setData] = useState(settings);
  const [isPending, startTransition] = useTransition();

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
        toast.success("Main currency settings updated");
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-8 space-y-2">
        <p className="text-sm text-muted-foreground uppercase tracking-widest">
          {data.mainCurrencyCode} - Currency ({data.mainCurrencySymbol})
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
              <Button variant="outline" size="sm">
                Change
              </Button>
            }
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-4 max-w-sm mx-auto">
        <div className="flex items-center justify-between">
          <Label>Unit position</Label>
          <Select
            value={data.mainCurrencySymbolPosition}
            onValueChange={(v: "Front" | "Back") => handleUpdate({ mainCurrencySymbolPosition: v })}
          >
            <SelectTrigger className="w-[180px] border-none shadow-none text-right justify-end font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Front">Front</SelectItem>
              <SelectItem value="Back">Back</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label>Decimal point</Label>
          <Select
            value={data.mainCurrencyDecimalPlaces.toString()}
            onValueChange={(v) => handleUpdate({ mainCurrencyDecimalPlaces: parseInt(v) })}
          >
            <SelectTrigger className="w-[180px] border-none shadow-none text-right justify-end font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
