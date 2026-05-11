"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";
import { bulkDeleteTransactions } from "@workspace/modules/transaction/transaction.action";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@workspace/ui";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/providers/confirm-modal-provider";
import { useTransactionsStore } from "@/stores/transactions";

export function TransactionBulkEditBar() {
  const { rowSelection, resetSelection } = useTransactionsStore();
  const selectedCount = Object.keys(rowSelection).length;
  const hasSelection = selectedCount > 0;
  const [show, setShow] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  useEffect(() => {
    setShow(hasSelection);
  }, [hasSelection]);

  if (!show && !hasSelection) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed right-0 bottom-10 left-0 z-50 flex justify-center"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <div className="pointer-events-auto flex min-w-[320px] items-center justify-between gap-4 border border-border/50 bg-background/80 px-6 py-2 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="font-medium font-sans text-foreground text-sm">{selectedCount} selected</span>
              <div className="mx-1 h-4 w-px bg-border" />
              <button
                type="button"
                onClick={resetSelection}
                className="flex items-center gap-1.5 font-sans text-muted-foreground text-xs transition-colors hover:text-foreground"
              >
                Deselect
              </button>
            </div>

            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-2 px-3 font-sans text-destructive text-xs hover:bg-destructive/10 hover:text-destructive"
                      disabled={isDeleting}
                      onClick={async () => {
                        const ids = Object.keys(rowSelection);
                        const ok = await confirm({
                          title: "Delete transactions?",
                          description: `Are you sure you want to delete ${ids.length} transactions?`,
                          destructive: true,
                          confirmLabel: "Delete",
                        });
                        if (!ok) return;

                        setIsDeleting(true);
                        const result = await bulkDeleteTransactions(ids);
                        if (result.success) {
                          toast.success(`Successfully deleted ${ids.length} transactions`);
                          await queryClient.invalidateQueries({
                            queryKey: ["transactions"],
                          });
                          resetSelection();
                          router.refresh();
                        } else {
                          toast.error(result.error);
                        }
                        setIsDeleting(false);
                      }}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Delete selected transactions</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="mx-1 h-4 w-px bg-border" />

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={resetSelection}
                      className="rounded-md p-1 transition-colors hover:bg-muted"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Close bulk edit bar</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
