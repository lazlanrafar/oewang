"use client";

import { useMemo, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCsvContext } from "./transaction-import-context";
import { Loader2, Plus, Wallet as WalletIcon, Tag } from "lucide-react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Icons,
} from "@workspace/ui";
import {
  getCategories,
  createCategory,
} from "@workspace/modules/category/category.action";
import {
  getWallets,
  createWallet,
} from "@workspace/modules/wallet/wallet.action";
import { toast } from "sonner";
import { SelectAccount } from "@/components/forms/select-account";
import { SelectCategory } from "@/components/forms/select-category";

export function ValueMapping({ onNext }: { onNext: () => void }) {
  const { firstRows, watch, valueMappings, setValueMappings } = useCsvContext();
  const [isLoading, setIsLoading] = useState(true);

  const categoryCol = watch("category");
  const walletCol = watch("walletIdColumn");
  const typeCol = watch("type");

  const uniqueCategories = useMemo(() => {
    if (!categoryCol || !firstRows) return [];
    const values = new Set<string>();
    firstRows.forEach((row) => {
      const val = row[categoryCol];
      if (val) values.add(val);
    });
    return Array.from(values).sort();
  }, [categoryCol, firstRows]);

  const uniqueWallets = useMemo(() => {
    if (!walletCol || !firstRows) return [];
    const values = new Set<string>();
    firstRows.forEach((row) => {
      const val = row[walletCol];
      if (val) values.add(val);
    });
    return Array.from(values).sort();
  }, [walletCol, firstRows]);

  const uniqueTypes = useMemo(() => {
    if (!typeCol || !firstRows) return [];
    const values = new Set<string>();
    firstRows.forEach((row) => {
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
          .replace(
            /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F30B}-\u{1F320}\u{1F400}-\u{1F4FF}\u{1F500}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
            "",
          )
          .trim();

      // 1. Auto-map Types
      uniqueTypes.forEach((val) => {
        if (!newMappings.types[val]) {
          const normalizedVal = normalize(val);
          for (const [type, variants] of Object.entries(TRANSACTION_TYPE_MAP)) {
            if (
              (variants as string[]).some((v) => normalize(v) === normalizedVal)
            ) {
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
  }, [uniqueCategories, uniqueWallets, uniqueTypes]);

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

  if (
    !uniqueCategories.length &&
    !uniqueWallets.length &&
    !uniqueTypes.length
  ) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          No accounts, categories, or types were mapped for value matching.
        </p>
        <Button onClick={onNext} variant="outline" size="sm">
          Continue to next step
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-10 max-h-[500px] pr-2 font-sans overflow-y-auto no-scrollbar">
      {uniqueTypes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <Icons.Apps className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight">
              Map Transaction Types
            </h3>
            <span className="text-[11px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full ml-auto">
              {uniqueTypes.length} types
            </span>
          </div>
          <div className="grid gap-2">
            {uniqueTypes.map((val) => (
              <div
                key={val}
                className="flex items-center gap-4 p-2.5 rounded-lg border bg-muted/20 hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{val}</p>
                </div>
                <div className="w-[240px]">
                  <Select
                    value={valueMappings.types[val] || ""}
                    onValueChange={(type) => handleTypeMap(val, type)}
                  >
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
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <WalletIcon className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight">
              Map Accounts
            </h3>
            <span className="text-[11px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full ml-auto">
              {uniqueWallets.length} values
            </span>
          </div>
          <div className="grid gap-2">
            {uniqueWallets.map((val) => (
              <div
                key={val}
                className="flex items-center gap-4 p-2.5 rounded-lg border bg-muted/20 hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{val}</p>
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
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <Tag className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight">
              Map Categories
            </h3>
            <span className="text-[11px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full ml-auto">
              {uniqueCategories.length} categories
            </span>
          </div>
          <div className="grid gap-2">
            {uniqueCategories.map((val) => (
              <div
                key={val}
                className="flex items-center gap-4 p-2.5 rounded-lg border bg-muted/20 hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{val}</p>
                </div>
                <CategoryMappingRow
                  csvValue={val}
                  handleCategoryMap={handleCategoryMap}
                  valueMappings={valueMappings}
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
}: {
  csvValue: string;
  handleCategoryMap: (csvValue: string, categoryId: string) => void;
  valueMappings: any;
}) {
  const queryClient = useQueryClient();
  return (
    <div className="w-[280px] flex gap-2">
      <SelectCategory
        type="expense"
        onChange={(id) => handleCategoryMap(csvValue, id)}
        value={valueMappings.categories[csvValue]}
        className="flex-1 h-8 text-xs"
      />
      {!valueMappings.categories[csvValue] && (
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 hover:bg-primary/10 hover:text-primary transition-colors"
          onClick={async () => {
            const res = await createCategory({
              name: csvValue,
              type: "expense",
            });
            if (res.success && res.data) {
              queryClient.invalidateQueries({
                queryKey: ["categories", "expense"],
              });
              handleCategoryMap(csvValue, res.data.id);
              toast.success(`Category "${csvValue}" created`);
            } else {
              toast.error(res.error || "Failed to create category");
            }
          }}
          title="Create this category"
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
