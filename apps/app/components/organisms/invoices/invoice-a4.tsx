"use client";

import { forwardRef } from "react";

import Image from "next/image";

import type { Dictionary } from "@workspace/dictionaries";
import { Separator } from "@workspace/ui";
import { format } from "date-fns";

interface InvoiceContact {
  name: string;
  email?: string | null;
}

interface InvoiceLineItem {
  name: string;
  quantity: number;
  price: number;
}

interface InvoiceWithContact {
  id: string;
  invoiceNumber: string;
  issueDate: string | null;
  dueDate: string | null;
  amount: number | string;
  vat?: number;
  vat_amount?: number | string;
  currency: string;
  noteDetails?: string | null;
  lineItems: InvoiceLineItem[];
  contact: InvoiceContact;
}

interface InvoiceA4Props {
  invoice: InvoiceWithContact;
  workspace?: {
    name: string;
    logoUrl?: string | null;
  };
  dictionary: Dictionary;
}

export const InvoiceA4 = forwardRef<HTMLDivElement, InvoiceA4Props>(({ invoice, workspace, dictionary }, ref) => {
  if (!invoice) return null;

  const dict = dictionary.invoices;

  return (
    <div ref={ref} className="flex min-h-[800px] flex-col bg-background p-8 text-foreground md:p-12 lg:p-16">
      <div className="mb-12 flex items-start justify-between">
        <div className="space-y-6">
          <h1 className="font-medium font-serif text-4xl text-foreground/90 tracking-tighter md:text-5xl">Invoice</h1>
        </div>

        {workspace && (
          <div className="flex flex-col items-end gap-3">
            {workspace?.logoUrl ? (
              <Image
                src={workspace.logoUrl}
                alt={workspace.name}
                width={96}
                height={48}
                className="h-12 w-auto object-contain transition-all dark:invert"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary font-bold font-serif text-primary-foreground text-xl shadow-inner">
                {workspace?.name.charAt(0)}
              </div>
            )}
            <span className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
              {workspace?.name}
            </span>
          </div>
        )}
      </div>

      <Separator className="mb-12 bg-border/50" />

      {/* Addresses Section */}
      <div className="mb-20 grid grid-cols-2 gap-20">
        <div className="space-y-6">
          <div>
            <p className="mb-3 font-bold text-[10px] text-muted-foreground/40 uppercase tracking-[0.3em]">
              {dict.details.bill_to || "Bill To"}
            </p>
            <div className="space-y-1">
              <p className="font-medium font-serif text-foreground/90 text-lg">{invoice.contact.name}</p>
              <p className="max-w-[200px] text-muted-foreground/80 text-xs leading-relaxed">{invoice.contact.email}</p>
            </div>
          </div>
        </div>

        <div className="space-y-6 text-right">
          <div>
            <p className="mb-3 font-bold text-[10px] text-muted-foreground/40 uppercase tracking-[0.3em]">
              {dict.details.details_label || "Details"}
            </p>
            <div className="space-y-3 font-mono text-[11px]">
              <div className="flex justify-end gap-4">
                <span className="text-muted-foreground/50 uppercase tracking-widest">
                  {dict.details.number || "Number"}
                </span>
                <span className="font-bold text-foreground/80">{invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-end gap-4">
                <span className="text-muted-foreground/50 uppercase tracking-widest">
                  {dict.details.issued || "Issued"}
                </span>
                <span className="font-bold text-foreground/80">
                  {invoice.issueDate ? format(new Date(invoice.issueDate), "MMM d, yyyy") : "-"}
                </span>
              </div>
              <div className="flex justify-end gap-4">
                <span className="text-muted-foreground/50 uppercase tracking-widest">{dict.details.due || "Due"}</span>
                <span className="font-bold text-foreground/80">
                  {invoice.dueDate ? format(new Date(invoice.dueDate), "MMM d, yyyy") : "-"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="flex-1">
        <div className="grid grid-cols-[1fr_80px_100px_120px] gap-4 border-border/50 border-b px-2 pb-4">
          <span className="font-bold text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em]">
            {dict.columns.description || "Description"}
          </span>
          <span className="text-center font-bold text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em]">
            {dict.columns.qty || "Qty"}
          </span>
          <span className="text-right font-bold text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em]">
            {dict.columns.rate || "Rate"}
          </span>
          <span className="text-right font-bold text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em]">
            {dict.columns.amount || "Amount"}
          </span>
        </div>

        <div className="divide-y divide-border/30">
          {invoice.lineItems.map((item: InvoiceLineItem) => (
            <div
              key={item.name}
              className="group grid grid-cols-[1fr_80px_100px_120px] gap-4 rounded-lg px-2 py-6 transition-colors hover:bg-muted/30"
            >
              <div className="font-medium text-foreground/90 text-sm">{item.name}</div>
              <div className="text-center font-mono text-muted-foreground text-sm">{item.quantity}</div>
              <div className="text-right font-mono text-muted-foreground text-sm">
                {new Intl.NumberFormat("en", {
                  style: "currency",
                  currency: invoice.currency,
                }).format(item.price)}
              </div>
              <div className="text-right font-bold font-mono text-foreground text-sm">
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
      <div className="mt-12 flex justify-end border-border border-t pt-8">
        <div className="w-full space-y-3 font-mono text-[11px] md:w-64">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="uppercase tracking-widest">{dict.details.subtotal || "Subtotal"}</span>
            <span className="text-foreground/80">
              {new Intl.NumberFormat("en", {
                style: "currency",
                currency: invoice.currency,
              }).format(Number(invoice.amount) - (Number(invoice.vat_amount) || 0))}
            </span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="uppercase tracking-widest">
              {dict.details.vat || "VAT"} ({invoice.vat || 0}%)
            </span>
            <span className="text-foreground/80">
              {new Intl.NumberFormat("en", {
                style: "currency",
                currency: invoice.currency,
              }).format(Number(invoice.vat_amount || 0))}
            </span>
          </div>

          <div className="flex items-center justify-between border-border border-t pt-4">
            <span className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
              {dict.details.total || "Total"}
            </span>
            <span className="font-bold text-foreground text-lg">
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
          <span className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
            {dict.details.note || "Note"}
          </span>
          <p className="max-w-md font-serif text-muted-foreground text-xs italic leading-relaxed">
            {invoice.noteDetails}
          </p>
        </div>
      )}
    </div>
  );
});

InvoiceA4.displayName = "InvoiceA4";
