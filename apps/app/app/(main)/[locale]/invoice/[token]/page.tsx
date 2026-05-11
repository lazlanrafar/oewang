"use client";

import { useRef, useState } from "react";

import { useParams, useSearchParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { getPublicInvoice } from "@workspace/modules/invoice/invoice.action";
import { Badge, Button, Card, CardContent, CardHeader, Input } from "@workspace/ui";
import { Check, Copy, Download, Loader2, Lock, Printer } from "lucide-react";
import { toast } from "sonner";

import { InvoiceA4 } from "@/components/organisms/invoices/invoice-a4";
import { downloadInvoiceAsPdf } from "@/lib/invoice-download";

export default function PublicInvoicePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const initialCode = searchParams.get("code") || "";

  const [code, setCode] = useState(initialCode);
  const [submittedCode, setSubmittedCode] = useState(initialCode);
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  const { data: response, isLoading } = useQuery({
    queryKey: ["public-invoice", token, submittedCode],
    queryFn: () => getPublicInvoice(token, submittedCode),
    enabled: !!token,
  });

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedCode(code);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopying(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setIsCopying(false), 2000);
  };

  const handleDownload = async () => {
    if (!invoiceRef.current || !response?.data?.invoice) return;

    await downloadInvoiceAsPdf({
      element: invoiceRef.current,
      filename: `Invoice-${response.data.invoice.invoiceNumber}`,
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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
      </div>
    );
  }

  if (!response?.success || !response?.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-none">
          <CardContent className="space-y-4 pt-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <Lock className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h3 className="font-serif text-2xl text-foreground tracking-wider">Access Denied</h3>
              <p className="text-muted-foreground">
                {response?.error || "Invoice link is no longer valid or has expired."}
              </p>
            </div>
            <Button
              variant="outline"
              className="border-border text-foreground"
              onClick={() => window.location.reload()}
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (response?.data?.needsCode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-none shadow-2xl">
          <CardHeader className="pb-2 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <Lock className="h-8 w-8 text-amber-500" />
            </div>
            <h1 className="font-serif text-2xl text-foreground tracking-wider">Protected Invoice</h1>
            <p className="mt-2 text-foreground text-sm">
              Invoice {response?.data?.invoiceNumber} is protected by an access code.
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleVerify} className="space-y-6">
              <Input
                type="password"
                placeholder="Enter access code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
              <Button type="submit" className="w-full">
                View Invoice
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invoice = response.data.invoice;
  const _contact = response.data.contact;
  const workspace = response.data.workspace;
  const settings = response.data.settings;
  const invoiceDictionary = response.data.dictionary as Dictionary | undefined;

  if (!invoiceDictionary?.invoices) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-none">
          <CardContent className="space-y-2 pt-8 text-center">
            <h3 className="font-serif text-2xl text-foreground tracking-wider">Dictionary Missing</h3>
            <p className="text-muted-foreground">English dictionary is missing invoice keys.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-none">
          <CardContent className="space-y-2 pt-8 text-center">
            <h3 className="font-serif text-2xl text-foreground tracking-wider">Invoice Not Found</h3>
            <p className="text-muted-foreground">Invoice data is unavailable for this link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invoiceForRender = {
    ...invoice,
    contact: {
      name: invoice.contact?.name || "Customer",
      email: invoice.contact?.email ?? null,
    },
  };

  const workspaceForRender =
    workspace?.name
      ? {
          name: workspace.name,
          logoUrl: workspace.logoUrl ?? null,
        }
      : undefined;

  return (
    <div className="min-h-screen bg-background p-4 font-sans text-foreground selection:bg-primary/20 md:p-12 print:bg-white print:p-0 print:text-black">
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .invoice-card {
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            color: black !important;
            padding: 0 !important;
            width: 100% !important;
          }
          .text-foreground {
            color: #71717a !important;
          }
          .text-foreground {
            color: #000000 !important;
          }
          .bg-background {
            background: white !important;
          }
          .border-border {
            border-color: #e5e7eb !important;
          }
          .separator {
            background-color: #e5e7eb !important;
          }
        }
      `}</style>

      <div className="mx-auto mb-32 max-w-3xl print:mb-0">
        <div className="no-print mb-12 flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-bold text-[10px] text-primary-foreground">
              {settings?.invoiceLogoUrl ? (
                <>
                  {/* biome-ignore lint/performance/noImgElement: Invoice logo is a dynamic external image */}
                  <img src={settings.invoiceLogoUrl} alt={workspace?.name || "Workspace"} className="h-full w-full object-cover" />
                </>
              ) : (
                <span>{workspace?.name?.charAt(0)}</span>
              )}
            </div>
            <span className="font-semibold text-foreground/80 text-sm tracking-tight">
              {workspace?.name || "Oewang"}
            </span>
          </div>
          <Badge
            variant="outline"
            className="h-6 border-border bg-muted px-3 font-medium text-[10px] text-foreground capitalize tracking-wide"
          >
            {invoice.status}
          </Badge>
        </div>

        {/* Main Invoice Card */}
        <Card className="invoice-card overflow-hidden border border-border bg-background shadow-2xl print:rounded-none">
          <InvoiceA4
            ref={invoiceRef}
            invoice={invoiceForRender}
            workspace={workspaceForRender}
            dictionary={invoiceDictionary}
          />
        </Card>
      </div>

      {/* Action Bar */}
      <div className="no-print -translate-x-1/2 fixed bottom-8 left-1/2 z-50 flex items-center gap-1 rounded-xl border border-border bg-background p-1 shadow-2xl backdrop-blur-xl">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Download className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={handleCopy}
        >
          {isCopying ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" />
        </Button>
      </div>

      <div className="no-print select-none pb-12 text-center text-foreground/30">
        <p className="font-bold text-[9px] uppercase tracking-[0.4em]">Powered by Oewang</p>
      </div>
    </div>
  );
}
