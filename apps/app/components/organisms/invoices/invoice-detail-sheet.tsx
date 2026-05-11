"use client";

import { useEffect, useRef, useState } from "react";

import type { Dictionary } from "@workspace/dictionaries";
import { getInvoiceToken } from "@workspace/modules/invoice/invoice.action";
import type { UpdateInvoiceData } from "@workspace/modules/client";
import type { Invoice } from "@workspace/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Switch,
} from "@workspace/ui";
import { format } from "date-fns";
import { Copy, Download, ExternalLink, Globe, History, Lock } from "lucide-react";
import { toast } from "sonner";

import { useDebounce } from "@/hooks/use-debounce";
import { downloadInvoiceAsPdf } from "@/lib/invoice-download";

import { InvoiceA4 } from "./invoice-a4";
import { InvoiceActivity } from "./invoice-activity";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200",
  unpaid: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 border-yellow-200",
  paid: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-200",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-red-200",
  canceled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500 border-gray-200",
};

const ALLOWED_STATUSES = ["draft", "unpaid", "paid", "overdue", "canceled"] as const;

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
  contact?: { name?: string; email?: string } | null;
};

interface InvoiceDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceRow | null;
  onEdit?: (invoice: InvoiceRow) => void;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, data: UpdateInvoiceData) => void;
  dictionary: Dictionary;
}

function InfoRow({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${className}`}>
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-medium text-sm">{value}</span>
    </div>
  );
}

export function InvoiceDetailSheet({
  open,
  onOpenChange,
  invoice,
  onEdit,
  onDelete: _onDelete,
  onUpdate,
  dictionary,
}: InvoiceDetailSheetProps) {
  const dict = dictionary.invoices;
  const [statusLoading, setStatusLoading] = useState(false);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [accessCode, setAccessCode] = useState(invoice?.accessCode || "");

  const debouncedAccessCode = useDebounce(accessCode, 1000);
  const [isDownloading, setIsDownloading] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (invoice) {
      setAccessCode(invoice.accessCode || "");
    }
  }, [invoice?.id, invoice]);

  useEffect(() => {
    if (invoice && debouncedAccessCode !== (invoice.accessCode || "")) {
      onUpdate?.(invoice.id, { accessCode: debouncedAccessCode });
    }
  }, [debouncedAccessCode, invoice?.id, invoice.accessCode, invoice, onUpdate]);

  useEffect(() => {
    if (open && invoice?.id && invoice.isPublic && !publicToken) {
      getInvoiceToken(invoice.id).then((res) => {
        if (res.success) setPublicToken(res.data.token);
      });
    }
    if (!open) {
      setPublicToken(null);
    }
  }, [open, invoice?.id, invoice?.isPublic, publicToken]);

  if (!invoice) return null;

  const handleStatusChange = async (newStatus: Invoice["status"]) => {
    if (!onUpdate) return;
    setStatusLoading(true);
    try {
      await onUpdate(invoice.id, { status: newStatus });
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    } finally {
      setStatusLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!publicToken) return;
    const url = `${window.location.origin}/invoice/${publicToken}`;
    navigator.clipboard.writeText(url);
    setIsCopying(true);
    toast.success("Public link copied to clipboard");
    setTimeout(() => setIsCopying(false), 2000);
  };

  const handleDownload = async () => {
    if (!invoiceRef.current || !invoice) return;

    await downloadInvoiceAsPdf({
      element: invoiceRef.current,
      filename: `Invoice-${invoice.invoiceNumber}`,
      onStart: () => {
        setIsDownloading(true);
        toast.loading("Generating PDF...", { id: "pdf-download" });
      },
      onFinish: () => {
        setIsDownloading(false);
        toast.dismiss("pdf-download");
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="shrink-0 space-y-0 border-border/50 border-b pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                {dict.details.title || "Invoice Details"}
              </span>
              <SheetTitle className="flex items-center gap-2 font-medium font-serif text-2xl tracking-tight">
                {invoice.invoiceNumber}
                <Badge
                  variant="outline"
                  className={`inline-flex h-5 items-center px-2 py-0 font-bold text-[10px] uppercase tracking-wider ${STATUS_STYLES[invoice.status] ?? ""}`}
                >
                  {dict.statuses[invoice.status] || invoice.status}
                </Badge>
              </SheetTitle>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleDownload}
                disabled={isDownloading}
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="custom-scrollbar flex-1 overflow-y-auto">
          <div className="space-y-8">
            {/* Main Info */}
            <div className="space-y-4">
              <div className="flex items-baseline justify-between border-border/30 border-b py-2">
                <span className="text-muted-foreground text-sm">{dict.details.total_amount || "Total Amount"}</span>
                <span className="font-medium font-serif text-3xl">
                  {formatAmount(invoice.amount, invoice.currency)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-1 pt-2">
                <InfoRow label={dict.columns.contact || "Contact"} value={invoice.contact?.name ?? "-"} />
                <InfoRow label={dict.columns.issue_date || "Issue Date"} value={formatDate(invoice.issueDate)} />
                <InfoRow label={dict.columns.due_date || "Due Date"} value={formatDate(invoice.dueDate)} />
                <InfoRow label={dict.details.currency || "Currency"} value={invoice.currency} />
              </div>
            </div>

            {/* Public Access Section */}
            <div className="space-y-4 border-t pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <Globe className="h-4 w-4 text-emerald-500" />
                  {dict.details.public_sharing || "Public Sharing"}
                </div>
                <div className="flex items-center gap-3">
                  {invoice.isPublic && invoice.accessCode && (
                    <Badge
                      variant="secondary"
                      className="gap-1 border-amber-200 bg-amber-100 text-[10px] text-amber-700 hover:bg-amber-100"
                    >
                      <Lock className="h-3 w-3" />
                      {dict.details.code_protected || "Code Protected"}
                    </Badge>
                  )}
                  <Switch
                    checked={invoice.isPublic}
                    onCheckedChange={(checked) => onUpdate?.(invoice.id, { isPublic: checked })}
                  />
                </div>
              </div>

              {invoice.isPublic ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex h-8 flex-1 items-center truncate border border-border bg-background px-3 py-1.5 font-mono text-xs opacity-60">
                      {publicToken
                        ? `${window.location.host}/invoice/${publicToken.slice(0, 12)}...`
                        : dict.details.generating_link || "Generating link..."}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleCopyLink}
                        disabled={!publicToken}
                        className="h-8 gap-2 px-3"
                      >
                        {isCopying ? (
                          dict.actions.copied || "Copied"
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> {dict.actions.copy || "Copy"}
                          </>
                        )}
                      </Button>
                      <Button size="sm" variant="outline" asChild disabled={!publicToken} className="h-8 w-8 p-0">
                        <a href={`/invoice/${publicToken}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="invoice-access-code"
                      className="font-bold text-[10px] text-muted-foreground/50 uppercase tracking-widest"
                    >
                      {dict.details.protection_code}
                    </label>
                    <div className="group relative">
                      <Lock className="-translate-y-1/2 absolute top-1/2 left-2.5 h-3 w-3 text-muted-foreground/40 transition-colors group-focus-within:text-primary" />
                      <Input
                        id="invoice-access-code"
                        placeholder={dict.details.set_access_code}
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                        className="h-8 border-border/50 bg-background/50 pl-8 font-mono text-[11px] focus:border-border"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {dict.details.public_sharing_description || "Enable to share this invoice via a public link."}
                </p>
              )}
            </div>

            {/* Internal Notes */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="internal-note" className="border-none bg-muted/20 px-4">
                <AccordionTrigger className="gap-2 py-3 font-medium text-sm hover:no-underline">
                  <div className="flex flex-1 items-center gap-2 text-left">
                    <span>{dict.details.internal_note}</span>
                    {!invoice.internalNote && (
                      <span className="bg-muted px-1.5 py-0.5 font-normal text-[10px] text-muted-foreground">
                        {dictionary.common.empty}
                      </span>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="whitespace-pre-wrap pb-4 text-muted-foreground text-sm italic leading-relaxed">
                  {invoice.internalNote ||
                    dict.details.no_internal_notes ||
                    "No internal notes have been added for this invoice."}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Activity Feed */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-border/50 border-b pb-2 font-medium text-sm">
                <History className="h-4 w-4" />
                {dict.details.activity || "Activity"}
              </div>
              <InvoiceActivity invoiceId={invoice.id} dictionary={dictionary} />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex shrink-0 gap-3 border-border/50 border-t bg-background pt-6">
          <Select defaultValue={invoice.status} onValueChange={handleStatusChange} disabled={statusLoading}>
            <SelectTrigger className="h-10 flex-1 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALLOWED_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {dict.statuses[s] || s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" className="h-8 gap-2 border-border/50 px-6" onClick={() => onEdit?.(invoice)}>
            {dict.actions.edit || "Edit"}
          </Button>
        </div>
      </SheetContent>

      {/* Hidden InvoiceA4 for PDF Generation */}
      <div className="-z-50 pointer-events-none fixed top-0 left-0 w-[800px] opacity-0">
        <InvoiceA4 ref={invoiceRef} invoice={invoice} dictionary={dictionary} />
      </div>
    </Sheet>
  );
}
