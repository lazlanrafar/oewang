"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui";
import { LayoutGrid } from "lucide-react";
import { useAppStore } from "@/stores/app";

export type GroupByInterval = "none" | "daily" | "weekly" | "monthly";

interface Props {
  value: GroupByInterval;
  onValueChange: (value: GroupByInterval) => void;
}

export function TransactionGroupingSelector({ value, onValueChange }: Props) {
  const { dictionary } = useAppStore();

  if (!dictionary) return null;

  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as GroupByInterval)}
    >
      <SelectTrigger className="w-[140px]">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder={dictionary.transactions.group_by.placeholder} />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          {dictionary.transactions.group_by.none}
        </SelectItem>
        <SelectItem value="daily">
          {dictionary.transactions.group_by.daily}
        </SelectItem>
        <SelectItem value="weekly">
          {dictionary.transactions.group_by.weekly}
        </SelectItem>
        <SelectItem value="monthly">
          {dictionary.transactions.group_by.monthly}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
