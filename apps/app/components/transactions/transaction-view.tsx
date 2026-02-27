"use client";

import { useCallback, useEffect, useState } from "react";

import type { Category, Transaction, Wallet } from "@workspace/types";
import {
  Button,
  DateRangePicker,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui";
import { Loader2, Plus, Upload, X } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { getTransactions } from "@workspace/modules";

import { ImportModal } from "./import-modal";
import { TransactionForm } from "./transaction-form";
import { TransactionList } from "./transaction-list";

const PAGE_LIMIT = 20;

interface TransactionViewProps {
  initialTransactions: Transaction[];
  initialTotal?: number;
  initialWallets?: Wallet[];
  initialCategories?: Category[];
}

export function TransactionView({
  initialTransactions,
  initialTotal = 0,
  initialWallets = [],
  initialCategories = [],
}: TransactionViewProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);

  const [transactions, setTransactions] =
    useState<Transaction[]>(initialTransactions);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    Math.max(1, Math.ceil(initialTotal / PAGE_LIMIT)),
  );
  const [isLoading, setIsLoading] = useState(false);

  // Filters State
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [walletFilter, setWalletFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [isInitialMount, setIsInitialMount] = useState(true);

  const fetchPage = useCallback(
    async (
      p: number,
      filters: {
        dateRange?: DateRange;
        type: string;
        walletId: string;
        categoryId: string;
      },
    ) => {
      setIsLoading(true);
      try {
        const params: any = { page: p, limit: PAGE_LIMIT };
        if (filters.type !== "all") params.type = filters.type;
        if (filters.walletId !== "all") params.walletId = filters.walletId;
        if (filters.categoryId !== "all")
          params.categoryId = filters.categoryId;
        if (filters.dateRange?.from)
          params.startDate = filters.dateRange.from.toISOString();
        if (filters.dateRange?.to)
          params.endDate = filters.dateRange.to.toISOString();

        const res = await getTransactions(params);
        if (res.success && res.data) {
          setTransactions(res.data);
          const total = res.meta?.pagination?.total ?? 0;
          setTotalPages(Math.max(1, Math.ceil(total / PAGE_LIMIT)));
        }
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Refetch whenever page or filters change (skip initial — SSR data already loaded)
  useEffect(() => {
    if (isInitialMount) {
      setIsInitialMount(false);
      return;
    }
    fetchPage(page, {
      dateRange,
      type: typeFilter,
      walletId: walletFilter,
      categoryId: categoryFilter,
    });
  }, [page, dateRange, typeFilter, walletFilter, categoryFilter, fetchPage]);

  // Handle filter changes (reset page to 1)
  const handleFilterChange = (setter: any, value: any) => {
    setter(value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setDateRange(undefined);
    setTypeFilter("all");
    setWalletFilter("all");
    setCategoryFilter("all");
    setPage(1);
  };

  const handleAddSuccess = () => {
    setAddOpen(false);
    fetchPage(page, {
      dateRange,
      type: typeFilter,
      walletId: walletFilter,
      categoryId: categoryFilter,
    });
  };

  const handleEditSuccess = () => {
    setEditOpen(false);
    setSelectedTransaction(null);
    fetchPage(page, {
      dateRange,
      type: typeFilter,
      walletId: walletFilter,
      categoryId: categoryFilter,
    });
  };

  const handleRowClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setEditOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2 pb-6 shrink-0">
        <div>
          <h1 className="text-2xl tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your income and expenses across all wallets.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="w-full sm:w-auto flex-1"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          <Button
            className="w-full sm:w-auto flex-1"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Transaction
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <DateRangePicker
          range={dateRange!}
          onSelect={(range) => handleFilterChange(setDateRange, range)}
          placeholder="Select Date Range"
          className="w-[280px]"
        />

        <Select
          value={typeFilter}
          onValueChange={(val) => handleFilterChange(setTypeFilter, val)}
        >
          <SelectTrigger className="w-[140px] bg-background">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={walletFilter}
          onValueChange={(val) => handleFilterChange(setWalletFilter, val)}
        >
          <SelectTrigger className="w-[180px] bg-background">
            <SelectValue placeholder="Wallet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Wallets</SelectItem>
            {initialWallets.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={categoryFilter}
          onValueChange={(val) => handleFilterChange(setCategoryFilter, val)}
        >
          <SelectTrigger className="w-[180px] bg-background">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {initialCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(dateRange ||
          typeFilter !== "all" ||
          walletFilter !== "all" ||
          categoryFilter !== "all") && (
          <Button
            variant="ghost"
            onClick={handleResetFilters}
            className="px-3 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4 mr-2" />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Table area */}
      <div className="flex-1 overflow-auto relative bg-background rounded border">
        {isLoading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-xl">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <TransactionList
          transactions={transactions}
          onRowClick={handleRowClick}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>

      {/* Add Sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="sm:max-w-[540px] overflow-y-auto">
          <SheetHeader className="px-6 pt-6 pb-4">
            <SheetTitle>Add Transaction</SheetTitle>
          </SheetHeader>
          <div className="px-6 pb-6">
            <TransactionForm onSuccess={handleAddSuccess} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setSelectedTransaction(null);
        }}
      >
        <SheetContent className="sm:max-w-[540px] overflow-y-auto">
          <SheetHeader className="px-6 pt-6 pb-4">
            <SheetTitle>Edit Transaction</SheetTitle>
          </SheetHeader>
          <div className="px-6 pb-6">
            {selectedTransaction && (
              <TransactionForm
                key={selectedTransaction.id}
                transactionId={selectedTransaction.id}
                defaultValues={{
                  amount: Number(selectedTransaction.amount),
                  date: (() => {
                    const raw = selectedTransaction.date ?? "";
                    return typeof raw === "string"
                      ? raw.slice(0, 10)
                      : new Date(raw).toISOString().slice(0, 10);
                  })(),
                  type: selectedTransaction.type as
                    | "income"
                    | "expense"
                    | "transfer",
                  walletId: selectedTransaction.walletId ?? "",
                  toWalletId: selectedTransaction.toWalletId ?? "",
                  categoryId: selectedTransaction.categoryId ?? "",
                  name: (selectedTransaction as any).name ?? "",
                  description: selectedTransaction.description ?? "",
                }}
                initialAttachments={
                  (selectedTransaction as any).attachments ?? []
                }
                onSuccess={handleEditSuccess}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => {
          setImportOpen(false);
          setPage(1);
          fetchPage(1, {
            dateRange,
            type: typeFilter,
            walletId: walletFilter,
            categoryId: categoryFilter,
          });
        }}
      />
    </div>
  );
}
