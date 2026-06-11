import type { Metadata } from "next";
import Link from "next/link";

import { listBillingInvoices } from "@workspace/modules/server";

import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Billing Invoices",
};

export const dynamic = "force-dynamic";

const ZERO_DECIMAL = new Set([
  "IDR", "JPY", "KRW", "VND", "BIF", "CLP", "GNF", "MGA",
  "PYG", "RWF", "UGX", "VUV", "XAF", "XOF", "XPF",
]);

function formatMoney(amount: number, currency: string) {
  const display = ZERO_DECIMAL.has(currency.toUpperCase()) ? amount : amount / 100;
  return display.toLocaleString(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  });
}

export default async function BillingInvoicesPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  await getDictionary(locale);
  const result = await listBillingInvoices();
  const invoices = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-medium text-lg tracking-tight">Invoices</h2>
        <p className="text-muted-foreground text-xs">
          Receipts for every plan and add-on payment, generated automatically when payment is confirmed.
        </p>
      </div>

      {invoices.length === 0 ? (
        <div className="border bg-accent/5 p-12 text-center">
          <p className="font-semibold text-xs uppercase tracking-widest">No invoices yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[11px] text-muted-foreground leading-relaxed">
            Your first invoice appears here after your first paid subscription or add-on.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden border bg-background">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b bg-accent/5 font-semibold text-muted-foreground/80 uppercase tracking-widest">
                <th className="p-4 text-[10px]">Number</th>
                <th className="p-4 text-[10px]">Date</th>
                <th className="p-4 text-[10px]">Description</th>
                <th className="p-4 text-[10px]">Amount</th>
                <th className="p-4 text-right text-[10px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-muted/40">
              {invoices.map((inv) => (
                <tr key={inv.id} className="group transition-colors hover:bg-accent/5">
                  <td className="p-4 font-medium tracking-tight">{inv.invoiceNumber}</td>
                  <td className="p-4 font-medium text-muted-foreground">
                    {new Date(inv.paidAt ?? inv.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {inv.lineItems[0]?.description ?? inv.kind}
                  </td>
                  <td className="p-4 font-serif text-xs">{formatMoney(inv.total, inv.currency)}</td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/${locale}/billing-invoice/${inv.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border px-3 py-1.5 font-medium text-[10px] uppercase tracking-widest transition-colors hover:bg-foreground hover:text-background"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
