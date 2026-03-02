"use client";

import { useUsersStore } from "@/stores/users";
import type { PaginationState } from "@tanstack/react-table";
import { DataTable } from "@workspace/ui";
import type { SystemAdminUser } from "@workspace/types";
import { userColumns } from "./user-columns";

type Props = {
  data: SystemAdminUser[];
  onRowClick?: (user: SystemAdminUser) => void;
  pagination?: PaginationState;
  onPaginationChange?: (updater: any) => void;
  rowCount?: number;
  pageCount?: number;
};

export function UserDataTable({
  data,
  onRowClick,
  pagination,
  onPaginationChange,
  rowCount,
  pageCount,
}: Props) {
  const { setColumns } = useUsersStore();

  return (
    <DataTable
      data={data}
      columns={userColumns}
      setColumns={setColumns}
      tableId="users"
      meta={{ onRowClick }}
      sticky={{
        columns: ["name"],
        startFromColumn: 1,
      }}
      emptyMessage="No users found."
      manualPagination
      pagination={pagination}
      onPaginationChange={onPaginationChange}
      rowCount={rowCount}
      pageCount={pageCount}
    />
  );
}
