"use client";

import { useState, useEffect, useRef } from "react";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Switch,
  Input,
} from "@workspace/ui";
import { format } from "date-fns";
import type { Invoice } from "@workspace/types";
import { InvoiceActivity } from "./invoice-activity";
import { InvoiceA4 } from "./invoice-a4";
import { downloadInvoiceAsPdf } from "@/lib/invoice-download";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Copy,
  ExternalLink,
  Download,
  MoreHorizontal,
  Mail,
  Eye,
  Share2,
  ChevronDown,
  Lock,
  Globe,
  History,
} from "lucide-react";
import { getInvoiceToken } from "@workspace/modules/invoice/invoice.action";

const STATUS_STYLES: Record<string, string> = {
  draft:
    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200",
  unpaid:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 border-yellow-200",
  paid: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-200",
  overdue:
    "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-red-200",
  canceled:
    "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500 border-gray-200",
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
  contact?: { name?: string; email?: string } | null;
};

interface InvoiceDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceRow | null;
  onEdit?: (invoice: InvoiceRow) => void;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, data: Partial<Invoice>) => void;
}

function InfoRow({
  label,
  value,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${className}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export function InvoiceDetailSheet({
  open,
  onOpenChange,
  invoice,
  onEdit,
  onDelete,
  onUpdate,
}: InvoiceDetailSheetProps) {
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
  }, [invoice?.id]);

  useEffect(() => {
    if (invoice && debouncedAccessCode !== (invoice.accessCode || "")) {
      onUpdate?.(invoice.id, { accessCode: debouncedAccessCode });
    }
  }, [debouncedAccessCode, invoice?.id]);

  useEffect(() => {
    if (open && invoice?.id && invoice?.isPublic && !publicToken) {
      getInvoiceToken(invoice.id).then((res) => {
        if (res.success) setPublicToken(res.data.token);
      });
    }
    if (!open) {
      setPublicToken(null);
    }
  }, [open, invoice?.id, invoice?.isPublic]);

  if (!invoice) return null;

  const handleStatusChange = async (newStatus: any) => {
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
        <SheetHeader className="pb-4 border-b border-border/50 shrink-0 space-y-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                Invoice Details
              </span>
              <SheetTitle className="text-2xl font-serif font-medium tracking-tight flex items-center gap-2">
                {invoice.invoiceNumber}
                <Badge
                  variant="outline"
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0 h-5 inline-flex items-center ${STATUS_STYLES[invoice.status] ?? ""}`}
                >
                  {invoice.status}
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

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="space-y-8">
            {/* Main Info */}
            <div className="space-y-4">
              <div className="flex items-baseline justify-between py-2 border-b border-border/30">
                <span className="text-sm text-muted-foreground">
                  Total Amount
                </span>
                <span className="text-3xl font-serif font-medium">
                  {formatAmount(invoice.amount, invoice.currency)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-1 pt-2">
                <InfoRow
                  label="Contact"
                  value={invoice.contact?.name ?? "-"}
                />
                <InfoRow
                  label="Issue Date"
                  value={formatDate(invoice.issueDate)}
                />
                <InfoRow label="Due Date" value={formatDate(invoice.dueDate)} />
                <InfoRow label="Currency" value={invoice.currency} />
              </div>
            </div>

            {/* Public Access Section */}
            <div className="space-y-4 border-t pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="h-4 w-4 text-emerald-500" />
                  Public Sharing
                </div>
                <div className="flex items-center gap-3">
                  {invoice.isPublic && invoice.accessCode && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-100 gap-1 border-amber-200"
                    >
                      <Lock className="h-3 w-3" />
                      Code Protected
                    </Badge>
                  )}
                  <Switch
                    checked={invoice.isPublic}
                    onCheckedChange={(checked) =>
                      onUpdate?.(invoice.id, { isPublic: checked })
                    }
                  />
                </div>
              </div>

              {invoice.isPublic ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1 px-3 py-1.5 bg-background border border-border text-xs font-mono truncate opacity-60 flex items-center h-8">
                      {publicToken
                        ? `${window.location.host}/invoice/${publicToken.slice(0, 12)}...`
                        : "Generating link..."}
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
                          "Copied"
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Copy
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        disabled={!publicToken}
                        className="h-8 w-8 p-0"
                      >
                        <a
                          href={`/invoice/${publicToken}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/50">
                      Protection Code (Optional)
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
                      <Input
                        placeholder="Set an access code..."
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                        className="h-8 pl-8 text-[11px] font-mono bg-background/50 border-border/50 focus:border-border"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Enable to share this invoice via a public link.
                </p>
              )}
            </div>

            {/* Internal Notes */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem
                value="internal-note"
                className="border-none bg-muted/20 px-4"
              >
                <AccordionTrigger className="py-3 hover:no-underline font-medium text-sm gap-2">
                  <div className="flex items-center gap-2 flex-1 text-left">
                    <span>Internal Note</span>
                    {!invoice.internalNote && (
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 text-muted-foreground font-normal">
                        Empty
                      </span>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed italic">
                  {invoice.internalNote ||
                    "No internal notes have been added for this invoice."}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Activity Feed */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium border-b border-border/50 pb-2">
                <History className="h-4 w-4" />
                Activity
              </div>
              <InvoiceActivity invoiceId={invoice.id} />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-6 border-t border-border/50 bg-background flex gap-3 shrink-0">
          <Select
            defaultValue={invoice.status}
            onValueChange={handleStatusChange}
            disabled={statusLoading}
          >
            <SelectTrigger className="flex-1 h-10 border-border/50">
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

          <Button
            variant="outline"
            className="h-8 px-6 gap-2 border-border/50"
            onClick={() => onEdit?.(invoice)}
          >
            Edit
          </Button>
        </div>
      </SheetContent>

      {/* Hidden InvoiceA4 for PDF Generation */}
      <div className="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none w-[800px]">
        <InvoiceA4 ref={invoiceRef} invoice={invoice} />
      </div>
    </Sheet>
  );
}
