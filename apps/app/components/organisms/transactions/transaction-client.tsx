"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import type { Category, Transaction, Wallet } from "@workspace/types";
import {
  Button,
  DataTable,
  DataTableColumnsVisibility,
  DataTableFilter,
  VirtualRow,
  DataTableRow,
  Icons,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DateRangePicker,
  cn,
} from "@workspace/ui";
import {
  Plus,
  Upload,
  Landmark,
  Receipt,
  FileUp,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { transactionColumns } from "./transaction-columns";
import { TransactionFormSheet } from "./transaction-form-sheet";
import { TransactionDetailSheet } from "./transaction-detail-sheet";
import { ImportModal } from "./transaction-import-modal";
import { useTransactionsStore } from "@/stores/transactions";
import { useSettingsStore } from "@/stores/settings-store";
import { TransactionBulkEditBar } from "./transaction-bulk-edit-bar";
import { TransactionTableSkeleton } from "./transaction-table-skeleton";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { Row } from "@tanstack/react-table";
import {
  getTransactions,
  deleteTransaction,
} from "@workspace/modules/transaction/transaction.action";
import { toast } from "sonner";
import { useQueryState, parseAsString } from "nuqs";
import { useEffect as useReactEffect } from "react";
import {
  startOfMonth,
  endOfMonth,
  parseISO,
  format,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
} from "date-fns";
import {
  TransactionGroupingSelector,
  type GroupByInterval,
} from "./transaction-grouping-selector";
import { formatCurrency } from "@workspace/utils";

interface Props {
  initialData: Transaction[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
  wallets: Wallet[];
  categories: Category[];
}

export function TransactionsClient({
  initialData,
  rowCount,
  pageCount,
  initialPage,
  pageSize,
  wallets,
  categories,
}: Props) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<
    Transaction | undefined
  >();
  const [columns, setColumns] = useState<any[]>([]);
  const { settings } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<"all" | "review">("all");
  const { rowSelection, setRowSelection } = useTransactionsStore();

  const [transactionId, setTransactionId] = useQueryState(
    "transactionId",
    parseAsString.withDefault("").withOptions({ shallow: true }),
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const [groupBy, setGroupBy] = useQueryState(
    "groupBy",
    parseAsString.withDefault("daily"),
  );

  const { filters, handleFilterChange } = useDataTableFilter({
    initialFilters: {
      q: "",
      type: "",
      walletId: "",
      categoryId: "",
      startDate: startOfMonth(new Date()).toISOString(),
      endDate: endOfMonth(new Date()).toISOString(),
    },
    debounceMs: 500,
  });

  const [mountFilters] = useState(filters);
  const isInitial = useMemo(() => {
    return (
      JSON.stringify(filters) === JSON.stringify(mountFilters) &&
      activeTab === "all"
    );
  }, [filters, mountFilters, activeTab]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["transactions", filters, activeTab],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await getTransactions({
        page: pageParam,
        limit: pageSize,
        type: filters.type || undefined,
        walletId: filters.walletId || undefined,
        categoryId: filters.categoryId || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        uncategorized: activeTab === "review",
      } as any);
      return res;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const pagination = lastPage.meta?.pagination;
      if (!pagination) return undefined;
      return pagination.page < pagination.total_pages
        ? pagination.page + 1
        : undefined;
    },
    staleTime: 300000,
    refetchOnWindowFocus: false,
    initialData: isInitial
      ? {
          pages: [
            {
              success: true,
              data: initialData,
              code: "OK",
              message: "Initial data",
              meta: {
                pagination: {
                  total: rowCount,
                  page: initialPage + 1,
                  limit: pageSize,
                  total_pages: pageCount,
                },
                timestamp: Date.now(),
              },
            },
          ],
          pageParams: [1],
        }
      : undefined,
  });

  const { data: reviewCountData } = useInfiniteQuery({
    queryKey: ["transactions", "review-count"],
    queryFn: async () => {
      const res = await getTransactions({
        page: 1,
        limit: 1,
        uncategorized: true,
      } as any);
      return res;
    },
    initialPageParam: 1,
    getNextPageParam: () => undefined,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const reviewCount = reviewCountData?.pages[0]?.meta?.pagination?.total ?? 0;

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      toast.success("Transaction deleted");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete transaction");
    },
  });

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const transactions = useMemo(
    () =>
      (data?.pages
        .flatMap((page) => page.data)
        .filter(Boolean) as Transaction[]) ?? [],
    [data],
  );

  const processedRows = useMemo(() => {
    if (groupBy === "none" || !transactions.length) return transactions;

    const groups = new Map<
      string,
      {
        transactions: Transaction[];
        income: number;
        expense: number;
        label: string;
      }
    >();

    for (const tx of transactions) {
      if (!tx.date) continue;
      const date = parseISO(tx.date);
      if (isNaN(date.getTime())) continue;

      let key = "";
      let label = "";

      if (groupBy === "daily") {
        key = format(date, "yyyy-MM-dd");
        label = format(date, "EEEE, dd MMM yyyy");
      } else if (groupBy === "weekly") {
        const start = startOfWeek(date);
        const end = endOfWeek(date);
        key = format(start, "yyyy-ww");
        label = `${format(start, "dd MMM")} - ${format(end, "dd MMM yyyy")}`;
      } else if (groupBy === "monthly") {
        key = format(date, "yyyy-MM");
        label = format(date, "MMMM yyyy");
      }

      const group = groups.get(key) || {
        transactions: [],
        income: 0,
        expense: 0,
        label,
      };
      group.transactions.push(tx);

      const amount = Number.parseFloat(tx.amount || "0");
      if (!isNaN(amount)) {
        if (tx.type === "income" || tx.type === "transfer-in") {
          group.income += amount;
        } else if (tx.type === "expense" || tx.type === "transfer-out") {
          group.expense += amount;
        }
      }

      groups.set(key, group);
    }

    const result: any[] = [];
    groups.forEach((group, key) => {
      const isCollapsed = expandedGroups.has(key);
      result.push({
        id: `group-${key}`,
        groupKey: key,
        _isGroup: true,
        label: group.label,
        income: group.income,
        expense: group.expense,
        isExpanded: !isCollapsed,
        transactions: group.transactions,
      });
    });

    return result;
  }, [transactions, groupBy, expandedGroups]);

  const columnsWithActions = useMemo(
    () =>
      transactionColumns((transaction) => {
        handleRowClick(transaction);
      }),
    [],
  );

  const handleRowClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setTransactionId(transaction.id);
    setIsDetailOpen(true);
  };

  useReactEffect(() => {
    if (transactionId) {
      const found = transactions.find((t) => t.id === transactionId);
      if (found) {
        if (selectedTransaction !== found) {
          setSelectedTransaction(found);
        }
        setIsDetailOpen(true);
      }
    } else if (!transactionId && isDetailOpen) {
      setIsDetailOpen(false);
      setSelectedTransaction(undefined);
    }
  }, [transactionId, transactions, isDetailOpen]);

  useReactEffect(() => {
    // Scroll handling is now managed by DataTable scrollTop prop.
  }, [groupBy]);

  // Keyboard navigation
  useReactEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isDetailOpen || !transactionId) return;

      const currentIndex = transactions.findIndex(
        (t) => t.id === transactionId,
      );
      if (currentIndex === -1) return;

      if (e.key === "ArrowDown") {
        const next = transactions[currentIndex + 1];
        if (next) {
          setTransactionId(next.id);
          setSelectedTransaction(next);
        }
      } else if (e.key === "ArrowUp") {
        const prev = transactions[currentIndex - 1];
        if (prev) {
          setTransactionId(prev.id);
          setSelectedTransaction(prev);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDetailOpen, transactionId, transactions, setTransactionId]);

  const handleCreate = () => {
    setSelectedTransaction(undefined);
    setIsFormOpen(true);
  };

  const typeOptions = [
    { id: "income", name: "Income" },
    { id: "expense", name: "Expense" },
    { id: "transfer", name: "Transfer" },
  ];

  const nonClickableColumns = useMemo(
    () => new Set(["select", "actions", "category", "assignee", "account"]),
    [],
  );

  return (
    <div className="flex w-full flex-col h-full gap-4">
      {/* Search and Actions Header */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center flex-1">
          <DataTableFilter
            filters={filters}
            onFilterChange={handleFilterChange as any}
            placeholder="Search transactions..."
            showDateFilter={false}
            showAmountFilter={false}
            statusOptions={typeOptions}
            statusKey="type"
            statusLabel="Type"
            excludeKeys={["startDate", "endDate"]}
            className="w-full bg-transparent border-none p-0 focus-visible:ring-0"
          />
        </div>

        <div className="flex items-center gap-2">
          <TransactionGroupingSelector
            value={groupBy as GroupByInterval}
            onValueChange={(v) => setGroupBy(v)}
          />
          <DateRangePicker
            range={{
              from: filters.startDate ? parseISO(filters.startDate) : undefined,
              to: filters.endDate ? parseISO(filters.endDate) : undefined,
            }}
            onSelect={(range) => {
              handleFilterChange({
                ...filters,
                startDate: range?.from?.toISOString() ?? "",
                endDate: range?.to?.toISOString() ?? "",
              });
            }}
          />
          <DataTableColumnsVisibility columns={columns} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4" />
                <span className="text-sm">Add</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 ">
              <DropdownMenuItem
                className="gap-2 cursor-pointer"
                onClick={() => setIsImportOpen(true)}
              >
                <FileUp className="h-4 w-4" />
                <span>Import/backfill</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 cursor-pointer"
                onClick={handleCreate}
              >
                <Receipt className="h-4 w-4" />
                <span>Create transaction</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 cursor-pointer"
                onClick={() => {}}
              >
                <Upload className="h-4 w-4" />
                <span>Upload receipts</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* <div className="flex items-center bg-muted/20 p-1 rounded-md h-8 ml-2">
            <button
              onClick={() => setActiveTab("all")}
              className={cn(
                "px-3 h-6 text-xs font-medium rounded-[4px] transition-colors",
                activeTab === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab("review")}
              className={cn(
                "px-3 h-6 text-xs font-medium rounded-[4px] transition-colors flex items-center gap-1.5",
                activeTab === "review"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Review
              {reviewCount > 0 && (
                <span className="text-[10px] opacity-60">({reviewCount})</span>
              )}
            </button>
          </div> */}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {isLoading ? (
          <TransactionTableSkeleton hideHeader />
        ) : (
          <DataTable
            data={processedRows as any}
            columns={columnsWithActions}
            setColumns={setColumns}
            tableId="transactions"
            externalScrollContainerRef={containerRef}
            stickyOffset={0}
            sticky={{
              columns: ["select", "date", "name", "actions"],
              startFromColumn: 0,
            }}
            nonClickableColumns={nonClickableColumns}
            emptyMessage="No transactions found."
            infiniteScroll={true}
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            hFull
            virtualizationStrategy="flow"
            enableRowSelection={(row) => !(row.original as any)._isGroup}
            getRowHeight={(index) => {
              const item = processedRows[index] as any;
              if (item?._isGroup) {
                const headerHeight = 40;
                const rowHeight = 45;
                return item.isExpanded
                  ? headerHeight + item.transactions.length * rowHeight
                  : headerHeight;
              }
              return 45;
            }}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            meta={{
              categories,
              wallets,
              onRowClick: handleRowClick,
              onDelete: (id: string) => deleteMutation.mutate(id),
              // Custom selection logic for grouped rows (proxy rows)
              isAllTransactionsSelected: () => {
                const transactionIds = processedRows.flatMap((r: any) =>
                  r._isGroup
                    ? (r.transactions || []).map((t: any) => t.id)
                    : [r.id],
                );
                if (transactionIds.length === 0) return false;
                return transactionIds.every((id) => !!rowSelection[id]);
              },
              isSomeTransactionsSelected: () => {
                const transactionIds = processedRows.flatMap((r: any) =>
                  r._isGroup
                    ? (r.transactions || []).map((t: any) => t.id)
                    : [r.id],
                );
                return (
                  transactionIds.some((id) => !!rowSelection[id]) &&
                  !transactionIds.every((id) => !!rowSelection[id])
                );
              },
              toggleAllTransactions: (value: boolean) => {
                const transactionIds = processedRows.flatMap((r: any) =>
                  r._isGroup
                    ? (r.transactions || []).map((t: any) => t.id)
                    : [r.id],
                );

                setRowSelection((prev) => {
                  const next = { ...prev };
                  transactionIds.forEach((id) => {
                    if (value) {
                      next[id] = true;
                    } else {
                      delete next[id];
                    }
                  });
                  return next;
                });
              },
            }}
            renderRow={({ row, getStickyStyle, getStickyClassName, table }) => {
              const item = row.original as any;

              if (item._isGroup) {
                return (
                  <tbody key={item.id} className="w-full block group-container">
                    <tr
                      className="sticky w-full min-w-full flex border-b border-border bg-[#FBFBFA] dark:bg-[#0A0A0A] hover:bg-[#F2F1EF] hover:dark:bg-[#151515] transition-colors cursor-pointer group/header select-none z-30"
                      style={{
                        height: 40,
                        top: 44, // Sticky under the main header
                        width: "100%",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroup(item.groupKey);
                      }}
                    >
                      <td
                        className="flex items-center px-4 shrink-0 h-full"
                        style={{ width: "100%" }}
                      >
                        <div className="flex items-center gap-3 w-full">
                          <div className="flex h-4 w-4 shrink-0 items-center justify-center transition-transform duration-200">
                            {item.isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-nowrap">
                            {item.label}
                          </span>

                          <div className="ml-auto flex items-center gap-4">
                            <span className="text-[10px] font-bold text-emerald-500">
                              {formatCurrency(item.income, settings)}
                            </span>
                            <span className="text-[10px] font-bold text-rose-500">
                              {formatCurrency(item.expense, settings)}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {item.isExpanded &&
                      item.transactions.map((tx: any) => {
                        // We need to create a "proxy row" for the transaction because it's not actually
                        // in the table's internal row model (which only sees the groups).
                        // This ensures that table.column hooks (date, formatCurrency, etc.) get the right data.
                        const baseRow = table.getRowModel().flatRows[0] || row; // Fallback to avoid crash

                        const txRow = {
                          ...baseRow,
                          id: tx.id,
                          original: tx,
                          getValue: (columnId: string) => {
                            if (columnId in tx) return (tx as any)[columnId];
                            // Handle nested access (e.g. wallet.name)
                            if (columnId === "wallet.name")
                              return tx.wallet?.name;
                            if (columnId === "category.name")
                              return tx.category?.name;
                            return "";
                          },
                          getVisibleCells: () =>
                            baseRow.getVisibleCells().map((cell) => ({
                              ...cell,
                              id: `${tx.id}-${cell.column.id}`,
                              row: {
                                ...baseRow,
                                id: tx.id,
                                original: tx,
                                getIsSelected: () => !!rowSelection[tx.id],
                                toggleSelected: (value?: boolean) => {
                                  setRowSelection((prev) => {
                                    const next = { ...prev };
                                    const isSelected =
                                      value !== undefined
                                        ? value
                                        : !prev[tx.id];

                                    if (isSelected) {
                                      next[tx.id] = true;
                                    } else {
                                      delete next[tx.id];
                                    }
                                    return next;
                                  });
                                },
                                getValue: (colId: string) =>
                                  (tx as any)[colId] ||
                                  (tx.wallet && colId === "wallet.name"
                                    ? tx.wallet.name
                                    : ""),
                              },
                              getContext: () => ({
                                ...cell.getContext(),
                                row: {
                                  ...baseRow,
                                  id: tx.id,
                                  original: tx,
                                  getIsSelected: () => !!rowSelection[tx.id],
                                  toggleSelected: (value?: boolean) => {
                                    setRowSelection((prev) => {
                                      const next = { ...prev };
                                      const isSelected =
                                        value !== undefined
                                          ? value
                                          : !prev[tx.id];

                                      if (isSelected) {
                                        next[tx.id] = true;
                                      } else {
                                        delete next[tx.id];
                                      }
                                      return next;
                                    });
                                  },
                                  getValue: (colId: string) =>
                                    (tx as any)[colId] ||
                                    (tx.wallet && colId === "wallet.name"
                                      ? tx.wallet.name
                                      : ""),
                                },
                              }),
                            })),
                        } as unknown as Row<Transaction>;

                        return (
                          <DataTableRow
                            key={tx.id}
                            row={txRow}
                            rowHeight={45}
                            getStickyStyle={getStickyStyle}
                            getStickyClassName={getStickyClassName}
                            nonClickableColumns={nonClickableColumns}
                            onCellClick={(rowId, colId) => {
                              if (!nonClickableColumns.has(colId)) {
                                handleRowClick(tx);
                              }
                            }}
                            isSelected={!!rowSelection[tx.id]}
                            columnSizing={table.getState().columnSizing}
                            columnOrder={table.getState().columnOrder}
                            columnVisibility={table.getState().columnVisibility}
                          />
                        );
                      })}
                  </tbody>
                );
              }

              // This case happens if groupBy === "none"
              return (
                <tbody key={row.id} className="w-full block">
                  <DataTableRow
                    key={row.id}
                    row={row}
                    rowHeight={45}
                    getStickyStyle={getStickyStyle}
                    getStickyClassName={getStickyClassName}
                    nonClickableColumns={nonClickableColumns}
                    onCellClick={(rowId, colId) => {
                      if (!nonClickableColumns.has(colId)) {
                        handleRowClick(item as Transaction);
                      }
                    }}
                    isSelected={!!rowSelection[item.id]}
                    columnSizing={table.getState().columnSizing}
                    columnOrder={table.getState().columnOrder}
                    columnVisibility={table.getState().columnVisibility}
                  />
                </tbody>
              );
            }}
          />
        )}
      </div>

      <TransactionBulkEditBar />

      <TransactionFormSheet
        open={isFormOpen && !selectedTransaction}
        onOpenChange={setIsFormOpen}
        transaction={undefined}
      />

      <TransactionDetailSheet
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) {
            setTransactionId(null);
            setSelectedTransaction(undefined);
          }
        }}
        transaction={selectedTransaction}
        onNext={() => {
          const currentIndex = transactions.findIndex(
            (t) => t.id === transactionId,
          );

          // Trigger fetch next page if we are near the end
          if (
            currentIndex >= transactions.length - 2 &&
            hasNextPage &&
            !isFetchingNextPage
          ) {
            fetchNextPage();
          }

          const next = transactions[currentIndex + 1];
          if (next) {
            setTransactionId(next.id);
            setSelectedTransaction(next);
          }
        }}
        onPrevious={() => {
          const currentIndex = transactions.findIndex(
            (t) => t.id === transactionId,
          );
          const prev = transactions[currentIndex - 1];
          if (prev) {
            setTransactionId(prev.id);
            setSelectedTransaction(prev);
          }
        }}
      />

      <ImportModal
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        wallets={wallets}
        onSuccess={() => {
          setIsImportOpen(false);
        }}
      />
    </div>
  );
}
