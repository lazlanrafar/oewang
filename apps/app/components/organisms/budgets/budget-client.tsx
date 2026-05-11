"use client";

import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteBudget, getBudgetStatus } from "@workspace/modules/client";
import type { BudgetStatus } from "@workspace/types";
import { Button, DataTableEmptyState, Input, Progress } from "@workspace/ui";
import { formatCurrency } from "@workspace/utils";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { useAppStore } from "@/stores/app";

import { BudgetCard } from "./budget-card";
import { BudgetFormSheet } from "./budget-form-sheet";

interface Props {
  initialData: BudgetStatus[];
  dictionary: Record<string, string>;
  locale: string;
}

export function BudgetClient({ initialData, locale }: Props) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<BudgetStatus | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();
  const { settings } = useAppStore();

  const { data: budgets = [] } = useQuery({
    queryKey: ["budgets"],
    queryFn: async () => {
      const res = await getBudgetStatus();
      if (!res.success) throw new Error(res.message);
      return res.data || [];
    },
    initialData,
    staleTime: 60000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteBudget(id);
      if (!res.success) throw new Error(res.message);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Budget deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete budget");
    },
  });

  const handleEdit = (budget: BudgetStatus) => {
    setSelectedBudget(budget);
    setIsFormOpen(true);
  };

  const handleAdd = () => {
    setSelectedBudget(undefined);
    setIsFormOpen(true);
  };

  const filteredBudgets = useMemo(() => {
    return (budgets as BudgetStatus[]).filter((b: BudgetStatus) =>
      b.categoryName.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [budgets, searchQuery]);

  const totalBudgeted = (budgets as BudgetStatus[]).reduce((acc: number, b: BudgetStatus) => acc + b.amount, 0);
  const totalSpent = (budgets as BudgetStatus[]).reduce((acc: number, b: BudgetStatus) => acc + b.spent, 0);

  const usagePercent = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  return (
    <div className="fade-in flex h-full w-full animate-in flex-col space-y-4 duration-500">
      {/* Summary Cards - Matching Accounts Page Style */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1 border border-border p-6">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
            Total Monthly Budget
          </span>
          <span className="font-medium font-serif text-3xl tracking-tight">
            {formatCurrency(totalBudgeted, settings, { locale })}
          </span>
        </div>
        <div className="flex flex-col gap-1 border border-border p-6">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
            Total Spent (Current Month)
          </span>
          <span className="font-medium font-serif text-3xl tracking-tight">
            {formatCurrency(totalSpent, settings, { locale })}
          </span>
        </div>
        <div className="flex flex-col gap-1 border border-border p-6">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
            Overall Usage
          </span>
          <div className="mt-1 flex items-center gap-4">
            <span className="font-medium font-serif text-3xl tracking-tight">{Math.round(usagePercent)}%</span>
            <Progress value={usagePercent} className="h-1 flex-1 bg-muted" />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-4 px-1">
        <div className="group relative flex max-w-sm flex-1 items-center">
          <Search className="-translate-y-1/2 absolute top-1/2 left-0 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-foreground" />
          <Input
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 border-none bg-transparent pl-7 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleAdd} variant="outline" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Budget
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto">
        {filteredBudgets.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 pb-10 md:grid-cols-2 lg:grid-cols-3">
            {filteredBudgets.map((budget: BudgetStatus) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onEdit={handleEdit}
                onDelete={deleteMutation.mutate}
                currencyCode={settings?.mainCurrencyCode}
                locale={locale}
              />
            ))}
          </div>
        ) : (
          <DataTableEmptyState
            title={searchQuery ? "No results found" : "No budgets set"}
            description={
              searchQuery ? "Try adjusting your search filters." : "Start tracking your spending by creating a budget."
            }
            action={{
              label: "Create Budget",
              onClick: handleAdd,
            }}
          />
        )}
      </div>

      <BudgetFormSheet open={isFormOpen} onOpenChange={setIsFormOpen} budget={selectedBudget} />
    </div>
  );
}
