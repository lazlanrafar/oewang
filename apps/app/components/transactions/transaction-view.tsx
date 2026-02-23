"use client";

import { Transaction } from "@workspace/types";
import { TransactionList } from "./transaction-list";
import { TransactionForm } from "./transaction-form";
import { Button } from "@workspace/ui";
import { Plus, Loader2, Upload } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui";
import { useState, useEffect, useCallback } from "react";
import { getTransactions } from "@/actions/transaction.actions";
import { ImportModal } from "./import-modal";

const PAGE_LIMIT = 20;

interface TransactionViewProps {
  initialTransactions: Transaction[];
  initialTotal?: number;
}

export function TransactionView({
  initialTransactions,
  initialTotal = 0,
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

  const fetchPage = useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const res = await getTransactions({ page: p, limit: PAGE_LIMIT });
      if (res.success && res.data) {
        setTransactions(res.data);
        const total = res.meta?.pagination?.total ?? 0;
        setTotalPages(Math.max(1, Math.ceil(total / PAGE_LIMIT)));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refetch whenever page changes (skip initial — SSR data already loaded)
  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  const handleAddSuccess = () => {
    setAddOpen(false);
    fetchPage(page);
  };

  const handleEditSuccess = () => {
    setEditOpen(false);
    setSelectedTransaction(null);
    fetchPage(page);
  };

  const handleRowClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setEditOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between py-4 border-b shrink-0">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Transaction
          </Button>
        </div>
      </div>

      {/* Table area */}
      <div className="flex-1 overflow-auto relative">
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
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
          fetchPage(1);
        }}
      />
    </div>
  );
}
