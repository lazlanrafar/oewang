"use client";

import { useEffect, useMemo, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import type { TransactionImportValueMappings } from "@workspace/types";
import { createCategory, getCategories } from "@workspace/modules/category/category.action";
import { getWallets } from "@workspace/modules/wallet/wallet.action";
import { Button, Icons, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui";
import { Loader2, Plus, Tag, Wallet as WalletIcon } from "lucide-react";
import { toast } from "sonner";

import { SelectAccount } from "@/components/molecules/select-account";
import { SelectCategory } from "@/components/molecules/select-category";

import { useCsvContext } from "./transaction-import-context";

export function ValueMapping({ onNext }: { onNext: () => void }) {
  const { firstRows, watch, valueMappings, setValueMappings } = useCsvContext();
  const [isLoading, setIsLoading] = useState(true);

  const categoryCol = watch("category");
  const walletCol = watch("walletIdColumn");
  const typeCol = watch("type");

  const uniqueCategories = useMemo(() => {
    if (!categoryCol || !firstRows) return [];

    // Set of categories that appear in at least one non-transfer row
    const nonTransferCategories = new Set<string>();

    firstRows?.forEach((row) => {
      const catVal = row[categoryCol];
      if (!catVal) return;

      const csvType = typeCol ? row[typeCol] : null;
      const mappedType = csvType ? valueMappings.types[csvType] : null;

      // If it's not a transfer (or we don't know yet, default to showing it)
      const isTransfer = mappedType === "transfer-in" || mappedType === "transfer-out";

      if (!isTransfer) {
        nonTransferCategories.add(catVal);
      }
    });

    return Array.from(nonTransferCategories).sort();
  }, [categoryCol, firstRows, typeCol, valueMappings.types]);

  const uniqueWallets = useMemo(() => {
    if (!walletCol || !firstRows) return [];
    const values = new Set<string>();
    firstRows?.forEach((row) => {
      const val = row[walletCol];
      if (val) values.add(val);
    });
    return Array.from(values).sort();
  }, [walletCol, firstRows]);

  const uniqueTypes = useMemo(() => {
    if (!typeCol || !firstRows) return [];
    const values = new Set<string>();
    firstRows?.forEach((row) => {
      const val = row[typeCol];
      if (val) values.add(val);
    });
    return Array.from(values).sort();
  }, [typeCol, firstRows]);

  useEffect(() => {
    async function fetchData() {
      const [catRes, wallRes, { TRANSACTION_TYPE_MAP }] = await Promise.all([
        getCategories(),
        getWallets(),
        import("@workspace/constants"),
      ]);

      const cats = catRes.success ? catRes.data || [] : [];
      const walls = wallRes.success ? wallRes.data || [] : [];

      // Auto-mapping logic
      const newMappings = { ...valueMappings };
      let changed = false;

      // Normalization helper for fuzzy matching (removes emojis and special chars)
      const normalize = (s: string) =>
        s
          .toLowerCase()
          .replace(/\p{Extended_Pictographic}|\p{Emoji_Component}/gu, "")
          .trim();

      // 1. Auto-map Types
      uniqueTypes.forEach((val) => {
        if (!newMappings.types[val]) {
          const normalizedVal = normalize(val);
          for (const [type, variants] of Object.entries(TRANSACTION_TYPE_MAP)) {
            if ((variants as string[]).some((v) => normalize(v) === normalizedVal)) {
              newMappings.types[val] = type;
              changed = true;
              break;
            }
          }
        }
      });

      // 2. Auto-map Wallets
      uniqueWallets.forEach((val) => {
        if (!newMappings.wallets[val]) {
          const normalizedVal = normalize(val);
          const match = walls.find(
            (w) =>
              normalize(w.name) === normalizedVal ||
              normalize(w.name).includes(normalizedVal) ||
              normalizedVal.includes(normalize(w.name)),
          );
          if (match) {
            newMappings.wallets[val] = match.id;
            changed = true;
          }
        }
      });

      // 3. Auto-map Categories
      uniqueCategories.forEach((val) => {
        if (!newMappings.categories[val]) {
          const normalizedVal = normalize(val);
          const match = cats.find(
            (c) =>
              normalize(c.name) === normalizedVal ||
              normalize(c.name).includes(normalizedVal) ||
              normalizedVal.includes(normalize(c.name)),
          );
          if (match) {
            newMappings.categories[val] = match.id;
            changed = true;
          }
        }
      });

      if (changed) {
        setValueMappings(newMappings);
      }

      setIsLoading(false);
    }
    fetchData();
  }, [uniqueCategories, uniqueWallets, uniqueTypes, setValueMappings, valueMappings]);

  const handleCategoryMap = (csvValue: string, categoryId: string) => {
    setValueMappings({
      ...valueMappings,
      categories: {
        ...valueMappings.categories,
        [csvValue]: categoryId,
      },
    });
  };

  const handleWalletMap = (csvValue: string, walletId: string) => {
    setValueMappings({
      ...valueMappings,
      wallets: {
        ...valueMappings.wallets,
        [csvValue]: walletId,
      },
    });
  };

  const handleTypeMap = (csvValue: string, type: string) => {
    setValueMappings({
      ...valueMappings,
      types: {
        ...valueMappings.types,
        [csvValue]: type,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!uniqueCategories.length && !uniqueWallets.length && !uniqueTypes.length) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-muted-foreground text-sm">
          No accounts, categories, or types were mapped for value matching.
        </p>
        <Button onClick={onNext} variant="outline" size="sm">
          Continue to next step
        </Button>
      </div>
    );
  }

  return (
    <div className="no-scrollbar max-h-[500px] space-y-10 overflow-y-auto pr-2 font-sans">
      {uniqueTypes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-border/50 border-b pb-2">
            <Icons.Apps className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm tracking-tight">Map Transaction Types</h3>
            <span className="ml-auto bg-primary/10 px-1.5 py-0.5 font-medium text-[11px] text-primary">
              {uniqueTypes.length} types
            </span>
          </div>
          <div className="grid gap-2">
            {uniqueTypes.map((val) => (
              <div
                key={val}
                className="flex items-center gap-4 border bg-muted/20 p-2.5 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{val}</p>
                </div>
                <div className="w-[240px]">
                  <Select value={valueMappings.types[val] || ""} onValueChange={(type) => handleTypeMap(val, type)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income" className="text-xs">
                        Income
                      </SelectItem>
                      <SelectItem value="expense" className="text-xs">
                        Expense
                      </SelectItem>
                      <SelectItem value="transfer-in" className="text-xs">
                        Transfer In
                      </SelectItem>
                      <SelectItem value="transfer-out" className="text-xs">
                        Transfer Out
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {uniqueWallets.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-border/50 border-b pb-2">
            <WalletIcon className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm tracking-tight">Map Accounts</h3>
            <span className="ml-auto bg-primary/10 px-1.5 py-0.5 font-medium text-[11px] text-primary">
              {uniqueWallets.length} values
            </span>
          </div>
          <div className="grid gap-2">
            {uniqueWallets.map((val) => (
              <div
                key={val}
                className="flex items-center gap-4 border bg-muted/20 p-2.5 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{val}</p>
                </div>
                <div className="w-[240px]">
                  <SelectAccount
                    value={valueMappings.wallets[val] || undefined}
                    onChange={(id) => handleWalletMap(val, id)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {uniqueCategories.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-border/50 border-b pb-2">
            <Tag className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm tracking-tight">Map Categories</h3>
            <span className="ml-auto bg-primary/10 px-1.5 py-0.5 font-medium text-[11px] text-primary">
              {uniqueCategories.length} categories
            </span>
          </div>
          <div className="grid gap-2">
            {uniqueCategories.map((val) => (
              <div
                key={val}
                className="flex items-center gap-4 border bg-muted/20 p-2.5 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{val}</p>
                </div>
                <CategoryMappingRow
                  csvValue={val}
                  handleCategoryMap={handleCategoryMap}
                  valueMappings={valueMappings}
                  firstRows={firstRows}
                  categoryCol={categoryCol}
                  typeCol={typeCol}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryMappingRow({
  csvValue,
  handleCategoryMap,
  valueMappings,
  firstRows,
  categoryCol,
  typeCol,
}: {
  csvValue: string;
  handleCategoryMap: (csvValue: string, categoryId: string) => void;
  valueMappings: TransactionImportValueMappings;
  firstRows: Record<string, string>[] | null;
  categoryCol: string;
  typeCol: string;
}) {
  const queryClient = useQueryClient();

  const getInferredType = (csvValue: string): "income" | "expense" => {
    const row = firstRows?.find((r) => r[categoryCol] === csvValue);
    if (!row) return "expense";
    const csvType = row[typeCol];
    const mappedType = csvType ? valueMappings.types[csvType] : "expense";
    return mappedType === "income" ? "income" : "expense";
  };

  const inferredType = getInferredType(csvValue);

  return (
    <div className="flex w-[280px] gap-2">
      <SelectCategory
        onChange={(id) => handleCategoryMap(csvValue, id)}
        value={valueMappings.categories[csvValue]}
        className="h-8 flex-1 text-xs"
      />
      {!valueMappings.categories[csvValue] && (
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 transition-colors hover:bg-primary/10 hover:text-primary"
          onClick={async () => {
            const res = await createCategory({
              name: csvValue,
              type: inferredType,
            });
            if (res.success && res.data) {
              queryClient.invalidateQueries({
                queryKey: ["categories", "all"],
              });
              queryClient.invalidateQueries({
                queryKey: ["categories", inferredType],
              });
              handleCategoryMap(csvValue, res.data.id);
              toast.success(`Category "${csvValue}" created as ${inferredType}`);
            } else {
              toast.error(res.error || "Failed to create category");
            }
          }}
          title={`Create as ${inferredType}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
