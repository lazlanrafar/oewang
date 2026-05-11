"use client";

import { useOrdersStore } from "@/stores/orders";
import {
  ScrollArea,
  Label,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  cn,
} from "@workspace/ui";
import { formatSubunits } from "@workspace/utils";
import { format } from "date-fns";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export function OrdersDetailSheet() {
  const { isDetailOpen, closeDetail, selectedOrder } = useOrdersStore();

  if (!selectedOrder) return null;

  const copyId = () => {
    navigator.clipboard.writeText(selectedOrder.code || selectedOrder.id);
    toast.success("Order ID copied to clipboard");
  };

  return (
    <Sheet open={isDetailOpen} onOpenChange={closeDetail}>
      <SheetContent>
        <SheetHeader className="sr-only">
          <SheetTitle>Order Details</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-full p-0 py-4">
          <div className="px-6 py-6">
            <div className="flex justify-between mb-8">
              <div className="flex-1 flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-[#606060] text-xs select-text flex items-center gap-2">
                    <div
                      className={cn(
                        "w-2 h-2",
                        selectedOrder.status === "paid"
                          ? "bg-green"
                          : selectedOrder.status === "pending"
                            ? "bg-yellow-500"
                            : "bg-red-500",
                      )}
                    />
                    <span className="capitalize">{selectedOrder.status}</span>
                  </span>
                  <span className="text-[#606060] text-xs select-text">
                    {selectedOrder.created_at
                      ? format(
                          new Date(selectedOrder.created_at),
                          "MMM d, y HH:mm",
                        )
                      : "Date unknown"}
                  </span>
                </div>

                <h2 className="mt-6 mb-3 select-text text-xl font-medium font-mono">
                  {selectedOrder.code}
                </h2>

                <div className="flex justify-between items-center">
                  <div className="flex flex-col w-full space-y-1">
                    <span
                      className={cn(
                        "text-4xl select-text font-serif",
                        selectedOrder.status === "paid" && "text-green",
                      )}
                    >
                      {formatSubunits(
                        selectedOrder.amount,
                        selectedOrder.currency,
                      )}
                    </span>
                    <div className="h-3">
                      <span className="text-[#606060] text-xs select-text">
                        Total Order Amount
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-b border-b-border/40 my-6"></div>

            <div className="grid grid-cols-2 gap-4 mt-6 mb-2">
              <div>
                <Label className="mb-2 block text-muted-foreground">
                  Customer Email
                </Label>
                <div className="h-[36px] flex items-center text-sm bg-muted/10">
                  {selectedOrder.userEmail || "N/A"}
                </div>
              </div>

              <div>
                <Label className="mb-2 block text-muted-foreground">
                  Customer Name
                </Label>
                <div className="h-[36px] flex items-center text-sm bg-muted/10">
                  {selectedOrder.userName || "N/A"}
                </div>
              </div>

              <div>
                <Label className="mb-2 block text-muted-foreground">
                  Workspace
                </Label>
                <div className="h-[36px] flex items-center text-sm bg-muted/10">
                  {selectedOrder.workspaceName || "N/A"}
                </div>
              </div>

              <div>
                <Label className="mb-2 block text-muted-foreground">
                  Currency
                </Label>
                <div className="h-[36px] flex items-center text-sm font-mono bg-muted/10">
                  {selectedOrder.currency.toUpperCase()}
                </div>
              </div>
            </div>

            <div className="border-b border-b-border/40 my-6"></div>

            <div className="mt-6 mb-2">
              <Label className="mb-4 block font-medium text-md">
                Mayar Information
              </Label>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label className="mb-2 block text-muted-foreground">
                    Mayar Invoice ID
                  </Label>
                  <div className="h-[36px] flex items-center text-sm font-mono bg-muted/10 px-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
                    {selectedOrder.mayar_invoice_id || "N/A"}
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block text-muted-foreground">
                    Mayar Transaction ID
                  </Label>
                  <div className="h-[36px] flex items-center text-sm font-mono bg-muted/10 px-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
                    {selectedOrder.mayar_transaction_id || "N/A"}
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block text-muted-foreground">
                    Mayar Payment ID
                  </Label>
                  <div className="h-[36px] flex items-center text-sm font-mono bg-muted/10 px-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
                    {selectedOrder.mayar_payment_id || "N/A"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4">
              <Label className="mb-2 block font-medium text-md">
                Internal Settings
              </Label>
              <div className="flex flex-row items-center justify-between border-b border-b-border/40 pb-4">
                <div className="space-y-0.5 pr-4">
                  <p className="text-xs text-muted-foreground">
                    Database internal identifier for this order record.
                  </p>
                </div>
                <button
                  onClick={copyId}
                  className="flex items-center gap-2 hover:text-green transition-colors text-xs font-mono group"
                >
                  <span className="opacity-80 group-hover:opacity-100">
                    {selectedOrder.id.slice(0, 12)}...
                  </span>
                  <Copy className="w-3 h-3 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
