"use client";

import { useQuery } from "@tanstack/react-query";
import { getPublicInvoice } from "@workspace/modules/invoice/invoice.action";
import { useParams, useSearchParams } from "next/navigation";
import { useState, useRef } from "react";
import { downloadInvoiceAsPdf } from "@/lib/invoice-download";
import {
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Separator,
} from "@workspace/ui";
import { Lock, Download, Printer, Loader2, Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { InvoiceA4 } from "@/components/organisms/invoices/invoice-a4";

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
      </div>
    );
  }

  if (!response?.success || !response?.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full border-none">
          <CardContent className="pt-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
              <Lock className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl text-foreground tracking-wider font-serif">
                Access Denied
              </h3>
              <p className="text-muted-foreground">
                {response?.error ||
                  "Invoice link is no longer valid or has expired."}
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
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full shadow-2xl border-none">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-6">
              <Lock className="h-8 w-8 text-amber-500" />
            </div>
            <h1 className="text-2xl text-foreground tracking-wider font-serif">
              Protected Invoice
            </h1>
            <p className="text-sm text-foreground mt-2">
              Invoice {response?.data?.invoiceNumber} is protected by an access
              code.
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
  const contact = response.data.contact;
  const workspace = response.data.workspace;
  const settings = response.data.settings;

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 p-4 md:p-12 print:p-0 print:bg-white print:text-black font-sans">
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

      <div className="max-w-3xl mx-auto mb-32 print:mb-0">
        <div className="flex items-center justify-between mb-12 px-2 no-print">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-[10px] overflow-hidden shrink-0">
              {settings?.invoiceLogoUrl ? (
                <img
                  src={settings.invoiceLogoUrl}
                  alt={workspace?.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{workspace?.name?.charAt(0)}</span>
              )}
            </div>
            <span className="font-semibold text-sm tracking-tight text-foreground/80">
              {workspace?.name || "Okane"}
            </span>
          </div>
          <Badge
            variant="outline"
            className="bg-muted border-border text-foreground capitalize h-6 px-3 text-[10px] font-medium tracking-wide"
          >
            {invoice.status}
          </Badge>
        </div>

        {/* Main Invoice Card */}
        <Card className="invoice-card border-border bg-background shadow-2xl overflow-hidden print:rounded-none border">
          <InvoiceA4 ref={invoiceRef} invoice={invoice} workspace={workspace} />
        </Card>
      </div>

      {/* Action Bar */}
      <div className="no-print fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 bg-background backdrop-blur-xl border border-border shadow-2xl z-50 rounded-xl">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-foreground hover:text-foreground hover:bg-muted transition-colors"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-foreground hover:text-foreground hover:bg-muted transition-colors"
          onClick={handleCopy}
        >
          {isCopying ? (
            <Check className="h-4 w-4 text-emerald-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-foreground hover:text-foreground hover:bg-muted transition-colors"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" />
        </Button>
      </div>

      <div className="no-print text-center pb-12 text-foreground/30 select-none">
        <p className="text-[9px] uppercase font-bold tracking-[0.4em]">
          Powered by Okane
        </p>
      </div>
    </div>
  );
}
