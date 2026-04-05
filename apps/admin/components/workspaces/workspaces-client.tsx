"use client";

import React, { useMemo } from "react";
import {
  DataTable,
  TableSkeleton,
  DataTableColumnsVisibility,
  DataTableFilter,
} from "@workspace/ui";
import type { SystemAdminWorkspace, SystemAdminPlan } from "@workspace/types";
import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { useWorkspacesStore } from "@/stores/workspaces";
import { getWorkspaceColumns } from "./workspace-columns";

type Props = {
  initialData: SystemAdminWorkspace[];
  plans: SystemAdminPlan[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
};

export function WorkspacesClient({
  initialData,
  plans,
  rowCount,
  pageCount,
  initialPage,
  pageSize,
}: Props) {
  const {
    filters,
    handleFilterChange,
    pagination,
    handlePaginationChange,
    isPending,
  } = useDataTableFilter({
    initialFilters: {
      q: "",
    },
    pageSize,
    initialPage,
  });

  const { columns: tableColumns, setColumns } = useWorkspacesStore();
  const workspaceColumns = useMemo(() => getWorkspaceColumns(plans), [plans]);

  return (
    <div className="flex w-full flex-col h-full space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl tracking-tight">Workspaces</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage all workspaces in the system.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <DataTableFilter
          filters={filters}
          onFilterChange={handleFilterChange as any}
          placeholder="Search workspaces..."
          showDateFilter={false}
          showAmountFilter={false}
        />

        <DataTableColumnsVisibility columns={tableColumns} />
      </div>

      <div className="flex-1 min-h-0 relative">
        {isPending ? (
          <TableSkeleton
            columns={workspaceColumns}
            rowCount={pageSize}
            stickyColumnIds={["name"]}
            className="h-full"
          />
        ) : (
          <DataTable
            data={initialData}
            columns={workspaceColumns}
            setColumns={setColumns}
            tableId="workspaces"
            sticky={{
              columns: ["name"],
              startFromColumn: 0,
            }}
            emptyMessage="No workspaces found."
            manualPagination
            pagination={pagination}
            onPaginationChange={handlePaginationChange}
            rowCount={rowCount}
            pageCount={pageCount}
            hFull
          />
        )}
      </div>
    </div>
  );
}
