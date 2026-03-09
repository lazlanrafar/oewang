"use client";

import { useTransactionsStore } from "@/stores/transactions";
import {
  Button,
  Icons,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, X, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { bulkDeleteTransactions } from "@workspace/modules/transaction/transaction.action";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function BulkEditBar() {
  const { rowSelection, resetSelection } = useTransactionsStore();
  const selectedCount = Object.keys(rowSelection).length;
  const hasSelection = selectedCount > 0;
  const [show, setShow] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setShow(hasSelection);
  }, [hasSelection]);

  if (!show && !hasSelection) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed bottom-10 left-0 right-0 flex justify-center z-50 pointer-events-none"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <div className="pointer-events-auto flex items-center gap-4 bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl px-6 py-3 shadow-2xl min-w-[320px] justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-sans font-medium text-foreground">
                {selectedCount} selected
              </span>
              <div className="h-4 w-px bg-border mx-1" />
              <button
                onClick={resetSelection}
                className="text-xs font-sans text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
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
                      className="h-8 text-xs font-sans text-destructive hover:text-destructive hover:bg-destructive/10 gap-2 px-3"
                      disabled={isDeleting}
                      onClick={async () => {
                        const ids = Object.keys(rowSelection);
                        setIsDeleting(true);
                        const result = await bulkDeleteTransactions(ids);
                        if (result.success) {
                          toast.success(
                            `Successfully deleted ${ids.length} transactions`,
                          );
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
                  <TooltipContent className="text-xs">
                    Delete selected transactions
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="h-4 w-px bg-border mx-1" />

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={resetSelection}
                      className="p-1 hover:bg-muted rounded-md transition-colors"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    Close bulk edit bar
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
