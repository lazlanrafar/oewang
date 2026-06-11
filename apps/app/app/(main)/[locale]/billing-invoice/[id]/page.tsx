import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getBillingInvoice } from "@workspace/modules/server";

import { PrintButton } from "@/components/organisms/setting/billing/print-button";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Invoice",
};

export const dynamic = "force-dynamic";

const ZERO_DECIMAL = new Set([
  "IDR",
  "JPY",
  "KRW",
  "VND",
  "BIF",
  "CLP",
  "GNF",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

function formatMoney(amount: number, currency: string) {
  const display = ZERO_DECIMAL.has(currency.toUpperCase())
    ? amount
    : amount / 100;
  return display.toLocaleString(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Standalone invoice page — rendered OUTSIDE the dashboard layout so there's
 * no sidebar, header or settings chrome. Opens in a new tab from billing-view
 * and from the invoice list. Browser print uses the `data-print-only-root`
 * pattern (see globals.css) so the PDF contains only the document.
 */
export default async function BillingInvoiceStandalonePage({
  params,
}: {
  params: Promise<{ id: string; locale: Locale }>;
}) {
  const { id, locale } = await params;
  await getDictionary(locale);
  const result = await getBillingInvoice(id);

  if (!result.success || !result.data) {
    notFound();
  }

  const inv = result.data;
  const issuedAt = inv.paidAt ?? inv.createdAt;

  return (
    <div
      data-print-only-root
      className="min-h-screen bg-muted/20 px-4 py-10 print:bg-background"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Toolbar — hidden when printing */}
        <div className="flex items-center justify-between print:hidden">
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
            {inv.invoiceNumber}
          </p>
          <div className="flex gap-2">
            {inv.mayarTransactionId && (
              <a
                href="https://portal.mayar.id"
                target="_blank"
                rel="noopener noreferrer"
                className="border bg-background px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent/5"
              >
                Open in Mayar
              </a>
            )}
            <PrintButton />
          </div>
        </div>

        {/* Invoice document — `print-document` class strips border + padding for print */}
        <div className="print-document border bg-background p-10 shadow-sm print:shadow-none">
          {/* Header */}
          <div className="mb-10 flex items-start justify-between border-b pb-8">
            <div>
              <h1 className="font-serif text-3xl tracking-tight">Invoice</h1>
              <p className="mt-1 font-mono text-muted-foreground text-xs">
                {inv.invoiceNumber}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
                Issued
              </p>
              <p className="font-medium text-sm">{formatDate(issuedAt)}</p>
            </div>
          </div>

          {/* From / To */}
          <div className="mb-10 grid grid-cols-2 gap-8">
            <div>
              <p className="mb-2 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
                From
              </p>
              <p className="font-medium text-sm">Oewang</p>
              <p className="text-muted-foreground text-xs">Subscription</p>
            </div>
            <div>
              <p className="mb-2 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
                Billed to
              </p>
              <p className="font-medium text-sm">
                {inv.workspaceName || "Workspace"}
              </p>
              {inv.billingEmail && (
                <p className="text-muted-foreground text-xs">
                  {inv.billingEmail}
                </p>
              )}
            </div>
          </div>

          {/* Period — only for subscription invoices */}
          {(inv.periodStart || inv.periodEnd) && (
            <div className="mb-10 grid grid-cols-2 gap-8 border-y py-4">
              <div>
                <p className="mb-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
                  Period
                </p>
                <p className="font-medium text-xs">
                  {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                </p>
              </div>
              <div>
                <p className="mb-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
                  Billing interval
                </p>
                <p className="font-medium text-xs capitalize">
                  {inv.billingInterval ?? "—"}
                </p>
              </div>
            </div>
          )}

          {/* Line items */}
          <table className="mb-8 w-full text-left text-xs">
            <thead>
              <tr className="border-b font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
                <th className="py-3 pr-4">Description</th>
                <th className="py-3 px-2 text-right">Qty</th>
                <th className="py-3 px-2 text-right">Unit</th>
                <th className="py-3 pl-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lineItems.map((li, idx) => (
                <tr key={idx} className="border-b border-muted/40">
                  <td className="py-4 pr-4">{li.description}</td>
                  <td className="py-4 px-2 text-right font-mono">
                    {li.quantity}
                  </td>
                  <td className="py-4 px-2 text-right font-mono">
                    {formatMoney(li.unit_amount, inv.currency)}
                  </td>
                  <td className="py-4 pl-2 text-right font-mono">
                    {formatMoney(li.amount, inv.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="ml-auto w-full max-w-[280px] space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">
                {formatMoney(inv.subtotal, inv.currency)}
              </span>
            </div>
            {inv.taxAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-mono">
                  {formatMoney(inv.taxAmount, inv.currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 font-semibold">
              <span>Total</span>
              <span className="font-mono">
                {formatMoney(inv.total, inv.currency)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-10 border-t pt-6 text-[10px] text-muted-foreground leading-relaxed">
            Paid via Mayar
            {inv.mayarTransactionId ? ` (txn ${inv.mayarTransactionId})` : ""}.
            This invoice was generated automatically when payment was confirmed.
          </p>
        </div>
      </div>
    </div>
  );
}
