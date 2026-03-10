"use client";

import { useMemo, useState } from "react";
import type { Category, Transaction, Wallet } from "@workspace/types";
import {
  Button,
  DataTable,
  DataTableColumnsVisibility,
  DataTableFilter,
  Icons,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@workspace/ui";
import { Plus, Upload, Landmark, Receipt, FileUp } from "lucide-react";
import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { transactionColumns } from "./transaction-columns";
import { TransactionFormSheet } from "./transaction-form-sheet";
import { TransactionDetailSheet } from "./transaction-detail-sheet";
import { ImportModal } from "./transaction-import-modal";
import { useTransactionsStore } from "@/stores/transactions";
import { useSettingsStore } from "@/stores/settings-store";
import { BulkEditBar } from "./transaction-bulk-edit-bar";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getTransactions,
  deleteTransaction,
} from "@workspace/modules/transaction/transaction.action";
import { toast } from "sonner";
import { useQueryState, parseAsString } from "nuqs";
import { useEffect as useReactEffect } from "react";

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

  const queryClient = useQueryClient();
  const { filters, handleFilterChange } = useDataTableFilter({
    initialFilters: {
      q: "",
      type: "",
      walletId: "",
      categoryId: "",
      startDate: "",
      endDate: "",
    },
    debounceMs: 500,
  });

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
    staleTime: 10000,
    refetchOnWindowFocus: false,
    initialData: {
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
    },
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

  const transactions = useMemo(
    () =>
      (data?.pages
        .flatMap((page) => page.data)
        .filter(Boolean) as Transaction[]) ?? [],
    [data],
  );

  const columnsWithActions = useMemo(
    () =>
      transactionColumns((transaction) => {
        setSelectedTransaction(transaction);
        setIsFormOpen(true);
      }),
    [],
  );

  const handleRowClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setTransactionId(transaction.id);
    setIsDetailOpen(true);
  };

  // Sync state with transactionId from URL
  useReactEffect(() => {
    if (transactionId) {
      const found = transactions.find((t) => t.id === transactionId);
      if (found) {
        // Only update if it's different to avoid infinite loops if shallow comparison fails
        if (JSON.stringify(found) !== JSON.stringify(selectedTransaction)) {
          setSelectedTransaction(found);
        }
        setIsDetailOpen(true);
      }
    } else if (!transactionId && isDetailOpen) {
      setIsDetailOpen(false);
      setSelectedTransaction(undefined);
    }
  }, [transactionId, transactions, selectedTransaction, isDetailOpen]);

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
    () => new Set(["select", "actions", "category", "assignee"]),
    [],
  );

  return (
    <div className="flex w-full flex-col h-full space-y-4">
      {/* Search and Actions Header */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center flex-1 max-w-sm">
          <DataTableFilter
            filters={filters}
            onFilterChange={handleFilterChange as any}
            placeholder="Search transactions..."
            showDateFilter={true}
            showAmountFilter={false}
            statusOptions={typeOptions}
            statusKey="type"
            statusLabel="Type"
            className="w-full bg-transparent border-none p-0 focus-visible:ring-0"
          />
        </div>

        <div className="flex items-center gap-2">
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

      <div className="flex-1 min-h-0 relative ">
        <DataTable
          data={transactions}
          columns={columnsWithActions}
          setColumns={setColumns}
          tableId="transactions"
          sticky={{
            columns: ["select", "date", "name", "actions"],
            startFromColumn: 0,
          }}
          nonClickableColumns={nonClickableColumns}
          emptyMessage="No transactions found."
          infiniteScroll
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          hFull
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          meta={{
            categories,
            wallets,
            onRowClick: handleRowClick,
            onDelete: (id: string) => deleteMutation.mutate(id),
          }}
        />
      </div>

      <BulkEditBar />

      <TransactionFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        transaction={selectedTransaction}
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
        onEdit={() => {
          setIsDetailOpen(false);
          setIsFormOpen(true);
        }}
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
