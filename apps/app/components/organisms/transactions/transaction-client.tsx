"use client";

import {
  type ComponentProps,
  useCallback,
  useEffect as useReactEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { ColumnDef, Row } from "@tanstack/react-table";
import type { Dictionary } from "@workspace/dictionaries";
import {
  deleteTransaction,
  getTransactions,
} from "@workspace/modules/transaction/transaction.action";
import type {
  Category,
  Transaction,
  TransactionQueryParams,
  Wallet,
} from "@workspace/types";
import {
  Button,
  cn,
  DataTable,
  DataTableColumnsVisibility,
  DataTableEmptyState,
  DataTableFilter,
  DataTableRow,
  DateRangePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icons,
} from "@workspace/ui";
import {
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  FileDown,
  FileUp,
  Plus,
} from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { toast } from "sonner";

import { useConfirm } from "@/components/providers/confirm-modal-provider";
import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { canEditWorkspaceData } from "@/lib/workspace-permissions";
import { useAppStore } from "@/stores/app";
import { useTransactionsStore } from "@/stores/transactions";

import { TransactionBulkEditBar } from "./transaction-bulk-edit-bar";
import { transactionColumns } from "./transaction-columns";
import { TransactionDetailSheet } from "./transaction-detail-sheet";
import { TransactionFormSheet } from "./transaction-form-sheet";
import {
  type GroupByInterval,
  TransactionGroupingSelector,
} from "./transaction-grouping-selector";
import { ImportModal } from "./transaction-import-modal";
import { ExportModal } from "./transaction-export-modal";
import { TransactionTableSkeleton } from "./transaction-table-skeleton";

interface TransactionGroup {
  id: string;
  groupKey: string;
  _isGroup: true;
  label: string;
  income: number;
  expense: number;
  isExpanded: boolean;
  transactions: Transaction[];
}

type TransactionRow = Transaction | TransactionGroup;

type TransactionsFilters = {
  q: string;
  type: string;
  walletId: string | string[];
  categoryId: string[];
  startDate: string;
  endDate: string;
  minAmount: string | number | null;
  maxAmount: string | number | null;
  attachments: "include" | "exclude" | null;
};

interface TransactionsClientProps {
  initialData: Transaction[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
  wallets: Wallet[];
  categories: Category[];
  dictionary: Dictionary;
}

const isTransactionGroup = (row: TransactionRow): row is TransactionGroup =>
  "_isGroup" in row;

const toNumberOrUndefined = (
  value: string | number | null,
): number | undefined => {
  if (value === null || value === "") return undefined;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getRowTransactionIds = (rows: TransactionRow[]): string[] =>
  rows.flatMap((row) =>
    isTransactionGroup(row) ? row.transactions.map((tx) => tx.id) : [row.id],
  );

const getTransactionValueByColumn = (
  tx: Transaction,
  columnId: string,
): string | number | boolean => {
  if (columnId === "wallet.name") return tx.wallet?.name || "";
  if (columnId === "category.name") return tx.category?.name || "";
  const value = tx[columnId as keyof Transaction];
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return "";
};

export function TransactionsClient({
  initialData,
  rowCount,
  pageCount,
  initialPage,
  pageSize,
  wallets,
  categories,
  dictionary,
}: TransactionsClientProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<
    Transaction | undefined
  >();
  const [columns, setColumns] = useState<
    ComponentProps<typeof DataTableColumnsVisibility>["columns"]
  >([]);
  const [activeTab, _setActiveTab] = useState<"all" | "review" | "none">("all");

  const containerRef = useRef<HTMLDivElement>(null);

  const { formatCurrency, getTransactionColor, workspace } = useAppStore();
  const { rowSelection, setRowSelection } = useTransactionsStore();
  const confirm = useConfirm();
  const canEditData = canEditWorkspaceData(workspace?.current_user_role);

  const [transactionId, setTransactionId] = useQueryState(
    "transactionId",
    parseAsString.withDefault("").withOptions({ shallow: true }),
  );

  const [groupBy, setGroupBy] = useQueryState(
    "groupBy",
    parseAsString.withDefault("daily"),
  );

  const { filters, handleFilterChange } =
    useDataTableFilter<TransactionsFilters>({
      initialFilters: {
        q: "",
        type: "",
        walletId: "",
        categoryId: [],
        startDate: startOfMonth(new Date()).toISOString(),
        endDate: endOfMonth(new Date()).toISOString(),
        minAmount: null,
        maxAmount: null,
        attachments: null,
      },
      debounceMs: 500,
    });

  const queryClient = useQueryClient();
  const [mountFilters] = useState(filters);

  const isInitial = useMemo(
    () =>
      JSON.stringify(filters) === JSON.stringify(mountFilters) &&
      activeTab === "all",
    [filters, mountFilters, activeTab],
  );

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
      const params: TransactionQueryParams = {
        page: pageParam,
        limit: pageSize,
        type: filters.type || undefined,
        walletId: filters.walletId || undefined,
        categoryId: filters.categoryId || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        minAmount: toNumberOrUndefined(filters.minAmount),
        maxAmount: toNumberOrUndefined(filters.maxAmount),
        hasAttachments:
          filters.attachments === "include"
            ? true
            : filters.attachments === "exclude"
              ? false
              : undefined,
        search: filters.q || undefined,
        uncategorized: activeTab === "review",
      };
      return getTransactions(params);
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
    queryKey: ["transactions", "review-count", filters.q],
    queryFn: async () => {
      const params: TransactionQueryParams = {
        page: 1,
        limit: 1,
        search: filters.q || undefined,
        uncategorized: true,
      };
      return getTransactions(params);
    },
    initialPageParam: 1,
    getNextPageParam: () => undefined,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const _reviewCount =
    reviewCountData?.pages?.[0]?.meta?.pagination?.total ?? 0;

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      toast.success(
        dictionary.transactions.toasts.deleted || "Transaction deleted",
      );
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      refetch();
    },
    onError: (error: Error) => {
      toast.error(
        error.message ||
          dictionary.transactions.errors.process_failed ||
          "Failed to delete transaction",
      );
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
      data?.pages
        ?.flatMap((page) => page.data ?? [])
        .filter((tx): tx is Transaction => Boolean(tx)) ?? [],
    [data],
  );

  const processedRows = useMemo<TransactionRow[]>(() => {
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
      if (Number.isNaN(date.getTime())) continue;

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
      if (!Number.isNaN(amount)) {
        if (tx.type === "income" || tx.type === "transfer-in") {
          group.income += amount;
        } else if (tx.type === "expense" || tx.type === "transfer-out") {
          group.expense += amount;
        }
      }

      groups.set(key, group);
    }

    const result: TransactionRow[] = [];
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

  const handleEdit = useCallback((transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsFormOpen(true);
  }, []);

  const columnsWithActions = useMemo(
    () =>
      dictionary
        ? (transactionColumns(
            handleEdit,
            dictionary,
            formatCurrency,
            getTransactionColor,
            canEditData,
          ) as ColumnDef<TransactionRow>[])
        : [],
    [handleEdit, dictionary, formatCurrency, getTransactionColor, canEditData],
  );

  const handleRowClick = useCallback(
    (transaction: Transaction) => {
      setSelectedTransaction(transaction);
      setTransactionId(transaction.id);
      setIsDetailOpen(true);
    },
    [setTransactionId],
  );

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
  }, [transactionId, transactions, isDetailOpen, selectedTransaction]);

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

  const getBGColor = useCallback(
    (type: string) => {
      const color = getTransactionColor(type);
      if (!color || color === "text-foreground") return "bg-muted-foreground";
      return color.replaceAll("text-", "bg-");
    },
    [getTransactionColor],
  );

  const typeOptions = useMemo(
    () => [
      {
        id: "income",
        name: dictionary.transactions.types.income || "Income",
        colorClass: getBGColor("income"),
      },
      {
        id: "expense",
        name: dictionary.transactions.types.expense || "Expense",
        colorClass: getBGColor("expense"),
      },
      {
        id: "transfer",
        name: dictionary.transactions.types.transfer || "Transfer",
        colorClass: getBGColor("transfer"),
      },
    ],
    [dictionary, getBGColor],
  );

  const categoryOptions = useMemo(
    () =>
      categories
        .sort((a, b) => {
          if (a.type !== b.type) return a.type.localeCompare(b.type);
          return a.name.localeCompare(b.name);
        })
        .map((c) => ({
          id: c.id,
          name: c.name,
          colorClass: getBGColor(c.type),
        })),
    [categories, getBGColor],
  );

  const walletOptions = useMemo(
    () =>
      wallets
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((w) => ({
          id: w.id,
          name: w.name,
        })),
    [wallets],
  );

  const attachmentsFilters = useMemo(
    () => [
      {
        id: "include",
        name:
          dictionary.transactions.filter.has_attachments || "Has attachments",
      },
      {
        id: "exclude",
        name: dictionary.transactions.filter.no_attachments || "No attachments",
      },
    ],
    [dictionary],
  );

  const manualFilters = useMemo(
    () => [
      {
        id: "include",
        name: dictionary.transactions.filter.manual || "Manual",
      },
      {
        id: "exclude",
        name:
          dictionary.transactions.filter.bank_connection || "Bank connection",
      },
    ],
    [dictionary],
  );

  const facets = useMemo(() => {
    if (!dictionary) return [];

    return [
      {
        id: "type",
        label: dictionary.transactions.type_label,
        icon: Icons.Status,
        options: typeOptions,
      },
      {
        id: "categoryId",
        label: dictionary.transactions.category,
        icon: Icons.Category,
        multiple: true,
        options: categoryOptions,
      },
      {
        id: "walletId",
        label: dictionary.transactions.account,
        icon: Icons.Accounts,
        multiple: true,
        options: walletOptions,
      },
    ];
  }, [dictionary, typeOptions, categoryOptions, walletOptions]);

  const nonClickableColumns = useMemo(
    () => new Set(["select", "actions", "category", "assignee", "account"]),
    [],
  );

  if (!dictionary) return <TransactionTableSkeleton hideHeader />;

  const handleCreate = () => {
    setSelectedTransaction(undefined);
    setIsFormOpen(true);
  };

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex flex-1 items-center">
          <DataTableFilter
            filters={filters}
            onFilterChange={handleFilterChange}
            placeholder={dictionary.transactions.search_placeholder}
            showDateFilter={false}
            showAmountFilter={true}
            showAttachments={true}
            showSource={true}
            facets={facets}
            attachmentsFilters={attachmentsFilters}
            manualFilters={manualFilters}
            excludeKeys={["startDate", "endDate"]}
            className="w-full border-none bg-transparent p-0 focus-visible:ring-0"
            categories={categories}
            accounts={wallets}
          />
        </div>

        <div className="flex items-center gap-2">
          <TransactionGroupingSelector
            value={groupBy as GroupByInterval}
            onValueChange={(v) => setGroupBy(v)}
            dictionary={dictionary}
          />
          <DateRangePicker
            range={{
              from: filters.startDate ? parseISO(filters.startDate) : undefined,
              to: filters.endDate ? parseISO(filters.endDate) : undefined,
            }}
            onSelect={(range) => {
              handleFilterChange({
                ...filters,
                startDate: range?.from ? range.from.toISOString() : "",
                endDate: range?.to ? range.to.toISOString() : "",
              });
            }}
          />
          <DataTableColumnsVisibility columns={columns} />

          {canEditData ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <FileUp className="h-4 w-4" />
                    <span className="hidden sm:inline-block ml-2 text-sm">
                      {dictionary.transactions.import_backfill}
                    </span>
                    <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsImportOpen(true)}>
                    <FileUp className="mr-2 h-4 w-4" />
                    {dictionary.transactions.backup_restore_device}
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    <FileDown className="mr-2 h-4 w-4" />
                    {dictionary.transactions.export_backup_email}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsExportOpen(true)}>
                    <FileDown className="mr-2 h-4 w-4" />
                    {dictionary.transactions.export_data_excel}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="icon" onClick={handleCreate}>
                <Plus className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setIsExportOpen(true)}>
              <FileDown className="h-4 w-4" />
              <span className="ml-2 text-sm">{dictionary.transactions.export_data_excel}</span>
            </Button>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <TransactionTableSkeleton hideHeader />
        ) : (
          <DataTable<TransactionRow>
            data={processedRows}
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
            emptyMessage={
              <DataTableEmptyState
                title={dictionary.transactions.empty.title}
                description={dictionary.transactions.empty.description}
                action={
                  canEditData
                    ? {
                        label: dictionary.transactions.empty.action,
                        onClick: handleCreate,
                      }
                    : undefined
                }
              />
            }
            infiniteScroll={true}
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            hFull
            virtualizationStrategy="flow"
            enableRowSelection={(row) => !isTransactionGroup(row.original)}
            getRowHeight={(index) => {
              const item = processedRows[index];
              if (item && isTransactionGroup(item)) {
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
              onRowClick: (row) => {
                if (!isTransactionGroup(row)) {
                  handleRowClick(row);
                }
              },
              onDelete: async (id: string) => {
                const ok = await confirm({
                  title:
                    dictionary.transactions.delete_title ||
                    "Delete transaction",
                  description:
                    dictionary.transactions.delete_description ||
                    "Are you sure you want to delete this transaction?",
                  destructive: true,
                  confirmLabel:
                    dictionary.transactions.delete_confirm || "Delete",
                });
                if (ok) {
                  deleteMutation.mutate(id);
                }
              },
              formatCurrency,
              getTransactionColor,
              canEditWorkspaceData: canEditData,
              isAllTransactionsSelected: () => {
                const transactionIds = getRowTransactionIds(processedRows);
                if (transactionIds.length === 0) return false;
                return transactionIds.every((id) => !!rowSelection[id]);
              },
              isSomeTransactionsSelected: () => {
                const transactionIds = getRowTransactionIds(processedRows);
                return (
                  transactionIds.some((id) => !!rowSelection[id]) &&
                  !transactionIds.every((id) => !!rowSelection[id])
                );
              },
              toggleAllTransactions: (value: boolean) => {
                const transactionIds = getRowTransactionIds(processedRows);
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
              const item = row.original;

              if (isTransactionGroup(item)) {
                return (
                  <tbody key={item.id} className="group-container block w-full">
                    <tr
                      className="group/header sticky z-30 flex w-full min-w-full cursor-pointer select-none border-border border-b bg-[#FBFBFA] transition-colors hover:bg-[#F2F1EF] dark:bg-[#0A0A0A] hover:dark:bg-[#151515]"
                      style={{
                        height: 40,
                        top: 44,
                        width: "100%",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroup(item.groupKey);
                      }}
                    >
                      <td
                        className="flex h-full shrink-0 items-center px-4"
                        style={{ width: "100%" }}
                      >
                        <div className="flex w-full items-center gap-3">
                          <div className="flex h-4 w-4 shrink-0 items-center justify-center transition-transform duration-200">
                            {item.isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <span className="text-nowrap font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                            {item.label}
                          </span>

                          <div className="ml-auto flex items-center gap-4">
                            <span
                              className={cn(
                                "font-bold text-[10px]",
                                getTransactionColor("income"),
                              )}
                            >
                              {formatCurrency(item.income)}
                            </span>
                            <span
                              className={cn(
                                "font-bold text-[10px]",
                                getTransactionColor("expense"),
                              )}
                            >
                              {formatCurrency(item.expense)}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {item.isExpanded &&
                      item.transactions.map((tx) => {
                        const baseRow = table.getRowModel().flatRows[0] || row;

                        const txRow = {
                          ...baseRow,
                          id: tx.id,
                          original: tx,
                          getValue: (columnId: string) =>
                            getTransactionValueByColumn(tx, columnId),
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
                                  getTransactionValueByColumn(tx, colId),
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
                                    getTransactionValueByColumn(tx, colId),
                                },
                              }),
                            })),
                        } as Row<TransactionRow>;

                        return (
                          <DataTableRow
                            key={tx.id}
                            row={txRow}
                            rowHeight={45}
                            getStickyStyle={getStickyStyle}
                            getStickyClassName={getStickyClassName}
                            nonClickableColumns={nonClickableColumns}
                            onCellClick={(_rowId, colId) => {
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

              return (
                <tbody key={row.id} className="block w-full">
                  <DataTableRow
                    key={row.id}
                    row={row}
                    rowHeight={45}
                    getStickyStyle={getStickyStyle}
                    getStickyClassName={getStickyClassName}
                    nonClickableColumns={nonClickableColumns}
                    onCellClick={(_rowId, colId) => {
                      if (!nonClickableColumns.has(colId)) {
                        handleRowClick(item);
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

      {canEditData ? <TransactionBulkEditBar /> : null}

      <TransactionFormSheet
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open && !isDetailOpen) {
            setSelectedTransaction(undefined);
          }
        }}
        transaction={isFormOpen ? selectedTransaction : undefined}
        dictionary={dictionary}
        canEdit={canEditData}
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
        dictionary={dictionary}
        canEdit={canEditData}
        onNext={() => {
          const currentIndex = transactions.findIndex(
            (t) => t.id === transactionId,
          );

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

      {canEditData ? (
        <ImportModal
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
          wallets={wallets}
          onSuccess={() => {
            setIsImportOpen(false);
            refetch();
          }}
        />
      ) : null}

      <ExportModal
        open={isExportOpen}
        onOpenChange={setIsExportOpen}
      />
    </div>
  );
}
