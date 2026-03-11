"use client";

import { Badge, Separator } from "@workspace/ui";
import { format } from "date-fns";
import type { Invoice } from "@workspace/types";
import { forwardRef } from "react";

interface InvoiceA4Props {
  invoice: any; // Using any for now to handle joined customer data
  workspace?: {
    name: string;
    logoUrl?: string | null;
  };
}

export const InvoiceA4 = forwardRef<HTMLDivElement, InvoiceA4Props>(
  ({ invoice, workspace }, ref) => {
    if (!invoice) return null;

    return (
      <div
        ref={ref}
        className="flex flex-col min-h-[800px] bg-background p-8 md:p-12 lg:p-16 text-foreground"
      >
        <div className="flex justify-between items-start mb-12">
          <div className="space-y-6">
            <h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tighter text-foreground/90">
              Invoice
            </h1>
          </div>

          {workspace && (
            <div className="flex flex-col items-end gap-3">
              {workspace.logoUrl ? (
                <img
                  src={workspace.logoUrl}
                  alt={workspace.name}
                  className="h-12 w-auto object-contain dark:invert transition-all"
                />
              ) : (
                <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-serif text-xl font-bold shadow-inner">
                  {workspace.name.charAt(0)}
                </div>
              )}
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                {workspace.name}
              </span>
            </div>
          )}
        </div>

        <Separator className="mb-12 bg-border/50" />

        {/* Addresses Section */}
        <div className="grid grid-cols-2 gap-20 mb-20">
          <div className="space-y-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground/40 mb-3">
                Bill To
              </p>
              <div className="space-y-1">
                <p className="font-serif text-lg font-medium text-foreground/90">
                  {invoice.customer?.name}
                </p>
                <p className="text-xs text-muted-foreground/80 leading-relaxed max-w-[200px]">
                  {invoice.customer?.email}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6 text-right">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground/40 mb-3">
                Details
              </p>
              <div className="space-y-3 font-mono text-[11px]">
                <div className="flex justify-end gap-4">
                  <span className="text-muted-foreground/50 uppercase tracking-widest">
                    Number
                  </span>
                  <span className="text-foreground/80 font-bold">
                    {invoice.invoiceNumber}
                  </span>
                </div>
                <div className="flex justify-end gap-4">
                  <span className="text-muted-foreground/50 uppercase tracking-widest">
                    Issued
                  </span>
                  <span className="text-foreground/80 font-bold">
                    {invoice.issueDate
                      ? format(new Date(invoice.issueDate), "MMM d, yyyy")
                      : "-"}
                  </span>
                </div>
                <div className="flex justify-end gap-4">
                  <span className="text-muted-foreground/50 uppercase tracking-widest">
                    Due
                  </span>
                  <span className="text-foreground/80 font-bold">
                    {invoice.dueDate
                      ? format(new Date(invoice.dueDate), "MMM d, yyyy")
                      : "-"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="flex-1">
          <div className="grid grid-cols-[1fr_80px_100px_120px] gap-4 pb-4 border-b border-border/50 px-2">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/40">
              Description
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/40 text-center">
              Qty
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/40 text-right">
              Rate
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/40 text-right">
              Amount
            </span>
          </div>

          <div className="divide-y divide-border/30">
            {invoice.lineItems.map((item: any, idx: number) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_80px_100px_120px] gap-4 py-6 px-2 group hover:bg-muted/30 transition-colors rounded-lg"
              >
                <div className="text-sm font-medium text-foreground/90">
                  {item.name}
                </div>
                <div className="text-sm font-mono text-muted-foreground text-center">
                  {item.quantity}
                </div>
                <div className="text-sm font-mono text-muted-foreground text-right">
                  {new Intl.NumberFormat("en", {
                    style: "currency",
                    currency: invoice.currency,
                  }).format(item.price)}
                </div>
                <div className="text-sm font-mono font-bold text-foreground text-right">
                  {new Intl.NumberFormat("en", {
                    style: "currency",
                    currency: invoice.currency,
                  }).format(item.price * item.quantity)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary Area */}
        <div className="mt-12 pt-8 border-t border-border flex justify-end">
          <div className="w-full md:w-64 space-y-3 font-mono text-[11px]">
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="uppercase tracking-widest">Subtotal</span>
              <span className="text-foreground/80">
                {new Intl.NumberFormat("en", {
                  style: "currency",
                  currency: invoice.currency,
                }).format(Number(invoice.amount) - (Number(invoice.vat) || 0))}
              </span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="uppercase tracking-widest">VAT (0%)</span>
              <span className="text-foreground/80">
                {new Intl.NumberFormat("en", {
                  style: "currency",
                  currency: invoice.currency,
                }).format(Number(invoice.vat) || 0)}
              </span>
            </div>

            <div className="pt-4 flex justify-between items-center border-t border-border">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Total
              </span>
              <span className="text-lg font-bold text-foreground">
                {new Intl.NumberFormat("en", {
                  style: "currency",
                  currency: invoice.currency,
                }).format(Number(invoice.amount))}
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.noteDetails && (
          <div className="mt-20 space-y-2">
            <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">
              Note
            </span>
            <p className="text-xs text-muted-foreground leading-relaxed font-serif italic max-w-md">
              {invoice.noteDetails}
            </p>
          </div>
        )}
      </div>
    );
  },
);

InvoiceA4.displayName = "InvoiceA4";
