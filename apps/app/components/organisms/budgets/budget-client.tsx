"use client";

import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { getBudgetStatus } from "@workspace/modules/client";
import type { BudgetStatus } from "@workspace/types";
import { DataTable, DataTableEmptyState, TableSkeleton } from "@workspace/ui";

import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { canEditWorkspaceData } from "@/lib/workspace-permissions";
import { useAppStore } from "@/stores/app";
import { useBudgetsStore } from "@/stores/budgets";

import { budgetColumns } from "./budget-columns";
import { BudgetClientCards } from "./budget-client-cards";
import { BudgetClientHeader } from "./budget-client-header";
import { BudgetFormSheet } from "./budget-form-sheet";

interface Props {
  initialData: BudgetStatus[];
  dictionary: Record<string, string>;
  locale: string;
}

type BudgetFilters = { q: string };

export function BudgetClient({ initialData, locale }: Props) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<BudgetStatus | undefined>();
  const { settings, workspace } = useAppStore();
  const canEditData = canEditWorkspaceData(workspace?.current_user_role);
  const { columns, setColumns } = useBudgetsStore();

  const { filters, handleFilterChange } = useDataTableFilter<BudgetFilters>({
    initialFilters: { q: "" },
  });

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ["budgets"],
    queryFn: async () => {
      const res = await getBudgetStatus();
      if (!res.success) throw new Error(res.message);
      return res.data || [];
    },
    initialData,
    staleTime: 60000,
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
    const q = (filters.q as string)?.toLowerCase() ?? "";
    if (!q) return budgets as BudgetStatus[];
    return (budgets as BudgetStatus[]).filter((b) => b.categoryName.toLowerCase().includes(q));
  }, [budgets, filters.q]);

  const totalBudgeted = useMemo(
    () => (budgets as BudgetStatus[]).reduce((acc, b) => acc + b.amount, 0),
    [budgets],
  );
  const totalSpent = useMemo(
    () => (budgets as BudgetStatus[]).reduce((acc, b) => acc + b.spent, 0),
    [budgets],
  );
  const usagePercent = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  const columnsWithActions = useMemo(
    () => budgetColumns(handleEdit, settings, locale),
    [settings, locale],
  );

  return (
    <div className="flex h-full w-full flex-col space-y-4">
      <BudgetClientCards
        totalBudgeted={totalBudgeted}
        totalSpent={totalSpent}
        usagePercent={usagePercent}
        isLoading={isLoading}
        settings={settings}
        locale={locale}
      />

      <BudgetClientHeader
        filters={filters as BudgetFilters}
        onFilterChange={handleFilterChange}
        columns={columns}
        onAdd={handleAdd}
      />

      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <TableSkeleton
            columns={columnsWithActions}
            rowCount={10}
            stickyColumnIds={["categoryName"]}
            actionsColumnId="actions"
          />
        ) : (
          <DataTable<BudgetStatus>
            data={filteredBudgets}
            columns={columnsWithActions}
            setColumns={setColumns}
            tableId="budgets"
            sticky={{ columns: ["categoryName"], startFromColumn: 0 }}
            emptyMessage={
              <DataTableEmptyState
                title={filters.q ? "No results found" : "No budgets set"}
                description={
                  filters.q
                    ? "Try adjusting your search filters."
                    : "Start tracking your spending by creating a budget."
                }
                action={{ label: "Create Budget", onClick: handleAdd }}
              />
            }
            hFull
            meta={{
              onRowClick: handleEdit,
            }}
          />
        )}
      </div>

      <BudgetFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        budget={selectedBudget}
        canEdit={canEditData}
      />
    </div>
  );
}
