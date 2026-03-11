"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Badge,
  Button,
  Separator,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui";
import { format } from "date-fns";
import type { Invoice } from "@workspace/types";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  unpaid:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  paid: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  canceled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
};

const ALLOWED_STATUSES = [
  "draft",
  "unpaid",
  "paid",
  "overdue",
  "canceled",
] as const;

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "MMM d, yyyy");
  } catch {
    return "-";
  }
}

function formatAmount(amount: number | string, currency: string) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency || "USD",
    }).format(Number(amount));
  } catch {
    return String(amount);
  }
}

type InvoiceRow = Invoice & {
  customer?: { name?: string; email?: string } | null;
};

interface InvoiceDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceRow | null;
  onEdit?: (invoice: InvoiceRow) => void;
  onDelete?: (id: string) => void;
  onStatusChange?: (id: string, status: string) => void;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">
        {value}
      </span>
    </div>
  );
}

export function InvoiceDetailSheet({
  open,
  onOpenChange,
  invoice,
  onEdit,
  onDelete,
  onStatusChange,
}: InvoiceDetailSheetProps) {
  const [statusLoading, setStatusLoading] = useState(false);

  if (!invoice) return null;

  const lineItems = (invoice.lineItems as any[]) || [];

  const handleStatusChange = async (newStatus: string) => {
    if (!onStatusChange) return;
    setStatusLoading(true);
    try {
      await onStatusChange(invoice.id, newStatus);
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[480px] overflow-y-auto p-0">
        <SheetHeader className="p-6 pb-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="font-mono">
              {invoice.invoiceNumber}
            </SheetTitle>
            <Badge
              variant="outline"
              className={STATUS_STYLES[invoice.status] ?? ""}
            >
              {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
            </Badge>
          </div>
        </SheetHeader>

        <div className="p-6 space-y-6">
          {/* Amount */}
          <div className="text-3xl font-semibold text-foreground">
            {formatAmount(invoice.amount, invoice.currency)}
          </div>

          <Separator />

          {/* Customer & Dates */}
          <div>
            <InfoRow
              label="Customer"
              value={(invoice as InvoiceRow).customer?.name ?? "-"}
            />
            <InfoRow label="Issue Date" value={formatDate(invoice.issueDate)} />
            <InfoRow label="Due Date" value={formatDate(invoice.dueDate)} />
            <InfoRow label="Currency" value={invoice.currency} />
          </div>

          {/* VAT & Tax */}
          {(Number(invoice.vat) > 0 || Number(invoice.tax) > 0) && (
            <>
              <Separator />
              <div>
                {Number(invoice.vat) > 0 && (
                  <InfoRow
                    label="VAT"
                    value={formatAmount(invoice.vat, invoice.currency)}
                  />
                )}
                {Number(invoice.tax) > 0 && (
                  <InfoRow
                    label="Tax"
                    value={formatAmount(invoice.tax, invoice.currency)}
                  />
                )}
              </div>
            </>
          )}

          {/* Line Items */}
          {lineItems.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-3">Line Items</h4>
                <div className="space-y-2">
                  {lineItems.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <div>
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground ml-2">
                          × {item.quantity}
                        </span>
                      </div>
                      <span>
                        {formatAmount(
                          item.price * item.quantity,
                          invoice.currency,
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          {invoice.noteDetails && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-1">Note</h4>
                <p className="text-sm text-muted-foreground">
                  {invoice.noteDetails}
                </p>
              </div>
            </>
          )}

          {invoice.internalNote && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-1">Internal Note</h4>
                <p className="text-sm text-muted-foreground">
                  {invoice.internalNote}
                </p>
              </div>
            </>
          )}

          {/* Status Switcher */}
          {onStatusChange && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">Change Status</h4>
                <Select
                  defaultValue={invoice.status}
                  onValueChange={handleStatusChange}
                  disabled={statusLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALLOWED_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {onEdit && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onEdit(invoice)}
              >
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  onDelete(invoice.id);
                  onOpenChange(false);
                }}
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
