"use client";

import type { SystemAdminUser } from "@workspace/types";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Checkbox,
  DataTable,
  DataTableColumnHeader,
  DataTableFacetedFilter,
  DataTablePagination,
  DataTableViewOptions,
  Input,
  getInitials,
} from "@workspace/ui";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Search, ShieldCheck, User, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminActionsDropdown } from "./admin-actions-dropdown";

export interface UsersViewProps {
  initialUsers: SystemAdminUser[];
  initialTotal?: number;
  initialSearch?: string;
  initialRole?: string;
  initialSortBy?: string;
  initialSortOrder?: "asc" | "desc";
  pageCount?: number;
}

const roleFilterOptions = [
  {
    label: "Owner",
    value: "owner",
    icon: ShieldCheck,
  },
  {
    label: "Finance",
    value: "finance",
    icon: ShieldCheck,
  },
  {
    label: "User",
    value: "user",
    icon: User,
  },
];

const columns: ColumnDef<SystemAdminUser>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex items-center gap-3 w-[250px]">
          <Avatar className="h-7 w-7">
            <AvatarImage
              src={user.profile_picture || ""}
              alt={user.name || "User"}
            />
            <AvatarFallback>
              {getInitials(user.name || user.email)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium truncate">{user.name || "No name"}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "system_role",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Role" />
    ),
    cell: ({ row }) => {
      const role = String(row.getValue("system_role"));
      const displayRole = role.charAt(0).toUpperCase() + role.slice(1);
      return <span className="text-muted-foreground">{displayRole}</span>;
    },
    filterFn: (row, id, value: string[]) => {
      if (!value || value.length === 0) return true;
      const cellValue = String(row.getValue(id));
      return value.includes(cellValue);
    },
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => {
      return (
        <span className="text-muted-foreground">{row.getValue("email")}</span>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Joined Date" />
    ),
    cell: ({ row }) => {
      return (
        <span className="text-muted-foreground whitespace-nowrap">
          {new Date(row.getValue("created_at")).toLocaleDateString()}
        </span>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <div className="text-right">
        <AdminActionsDropdown user={row.original} />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
];

export function UsersView({
  initialUsers,
  initialTotal = 0,
  initialSearch,
  initialRole,
  initialSortBy,
  initialSortOrder,
  pageCount,
}: UsersViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // --- URL sync helper (deferred to avoid calling startTransition during render) ---
  const syncToUrl = useCallback(
    (updates: Record<string, string | undefined>) => {
      // Use the actual current URL to prevent stale state before transitions complete
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      queueMicrotask(() => {
        startTransition(() => {
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        });
      });
    },
    [pathname, router],
  );

  // --- TanStack Table state (local) ---
  const [sorting, setSorting] = React.useState<SortingState>(
    initialSortBy
      ? [{ id: initialSortBy, desc: initialSortOrder === "desc" }]
      : [],
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    initialRole
      ? [
          {
            id: "system_role",
            value: decodeURIComponent(initialRole).split(","),
          },
        ]
      : [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({
      select: false,
    });
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState(initialSearch ?? "");

  const currentPageParams = searchParams.get("page");
  const startingPageIndex = currentPageParams
    ? parseInt(currentPageParams) - 1
    : 0;
  const currentLimitParams = searchParams.get("limit");
  const startingPageSize = currentLimitParams
    ? parseInt(currentLimitParams)
    : 50;

  const [pagination, setPagination] = React.useState({
    pageIndex: startingPageIndex,
    pageSize: startingPageSize,
  });

  const totalPages = pageCount ?? Math.ceil(initialTotal / pagination.pageSize);

  // --- Sorting change: update state, then sync to URL ---
  const handleSortingChange = useCallback(
    (updaterOrValue: SortingState | ((old: SortingState) => SortingState)) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(sorting)
          : updaterOrValue;
      setSorting(next);
      queueMicrotask(() => {
        if (next.length > 0) {
          syncToUrl({
            sortBy: next[0]?.id || "",
            sortOrder: next[0]?.desc ? "desc" : "asc",
          });
        } else {
          syncToUrl({ sortBy: undefined, sortOrder: undefined });
        }
      });
    },
    [sorting, syncToUrl],
  );

  // --- Column filter change: state-only (no URL sync here) ---
  const handleColumnFiltersChange = useCallback(
    (
      updaterOrValue:
        | ColumnFiltersState
        | ((old: ColumnFiltersState) => ColumnFiltersState),
    ) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(columnFilters)
          : updaterOrValue;
      setColumnFilters(next);
    },
    [columnFilters],
  );

  // --- Role filter URL sync (called by DataTableFacetedFilter) ---
  const handleRoleFilterChange = useCallback(
    (values: string[]) => {
      if (values.length > 0) {
        setColumnFilters([{ id: "system_role", value: values }]);
        syncToUrl({ system_role: values.join(",") });
      } else {
        setColumnFilters([]);
        syncToUrl({ system_role: undefined });
      }
    },
    [syncToUrl],
  );

  // --- Pagination change: update state, then sync to URL ---
  const handlePaginationChange = useCallback(
    (
      updaterOrValue:
        | typeof pagination
        | ((old: typeof pagination) => typeof pagination),
    ) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(pagination)
          : updaterOrValue;
      setPagination(next);
      queueMicrotask(() => {
        syncToUrl({
          page:
            next.pageIndex > 0 ? (next.pageIndex + 1).toString() : undefined,
          limit: next.pageSize !== 50 ? next.pageSize.toString() : undefined,
        });
      });
    },
    [pagination, syncToUrl],
  );

  // --- Search: debounce input, sync to URL ---
  const [searchValue, setSearchValue] = React.useState(initialSearch ?? "");
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip the first mount to prevent double-navigation
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      setGlobalFilter(searchValue);
      const updates: Record<string, string | undefined> = {
        search: searchValue || undefined,
      };
      // Reset to page 1 when searching
      if (searchValue) {
        updates.page = undefined;
        setPagination((prev) => ({ ...prev, pageIndex: 0 }));
      }
      syncToUrl(updates);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchValue, syncToUrl]);

  // --- Sync URL params to State on server navigation ---
  useEffect(() => {
    setColumnFilters(
      initialRole
        ? [
            {
              id: "system_role",
              value: decodeURIComponent(initialRole).split(","),
            },
          ]
        : [],
    );
  }, [initialRole]);

  // --- Check if any filters are active ---
  const isFiltered = columnFilters.length > 0;

  // --- Table instance ---
  const table = useReactTable({
    data: initialUsers,
    columns,
    pageCount: totalPages,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    enableRowSelection: true,
    autoResetPageIndex: false,
    autoResetExpanded: false,
    // @ts-ignore - Prevent TanStack table from resetting filters to initial mount values on every data fetch
    autoResetColumnFilters: false,
    getRowId: (row) => row.id.toString(),
    onRowSelectionChange: setRowSelection,
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: handleColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: handlePaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex flex-1 items-center space-x-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter users..."
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              className="h-8 w-[150px] lg:w-[250px] pl-8 bg-background"
            />
          </div>
          {table.getColumn("system_role") && (
            <DataTableFacetedFilter
              column={table.getColumn("system_role")}
              title="Role"
              options={roleFilterOptions}
              onFilterChange={handleRoleFilterChange}
              filterValues={
                columnFilters.find((f) => f.id === "system_role")?.value as
                  | string[]
                  | undefined
              }
            />
          )}
          {isFiltered && (
            <Button
              variant="ghost"
              onClick={() => {
                table.resetColumnFilters();
                syncToUrl({ system_role: undefined });
              }}
              className="h-8 px-2 lg:px-3"
            >
              Reset
              <X className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
        <DataTableViewOptions table={table} />
      </div>

      {/* Table Area */}
      <div className="rounded border bg-background flex-1 overflow-auto min-h-[400px]">
        <DataTable table={table} columns={columns} />
      </div>

      {/* Footer */}
      <DataTablePagination table={table} />
    </div>
  );
}
