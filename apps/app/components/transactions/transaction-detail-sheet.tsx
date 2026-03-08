"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Button,
  Badge,
  cn,
  Separator,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Input,
  Label,
  Switch,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Kbd,
} from "@workspace/ui";
import type { Transaction } from "@workspace/types";
import { format } from "date-fns";
import {
  Search,
  ChevronUp,
  ChevronDown,
  X,
  Plus,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { formatCurrency } from "@workspace/utils";
import { useCurrency } from "@workspace/ui/hooks";
import { useState } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction;
  onEdit?: () => void;
}

export function TransactionDetailSheet({
  open,
  onOpenChange,
  transaction,
  onEdit,
}: Props) {
  const { settings } = useCurrency();
  const [excludeFromReports, setExcludeFromReports] = useState(false);
  const [markAsRecurring, setMarkAsRecurring] = useState(false);

  if (!transaction) return null;

  const isExpense = transaction.type === "expense";
  const isIncome = transaction.type === "income";
  const isTransfer = transaction.type === "transfer";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[580px] p-0 flex flex-col h-full no-scrollbar">
        <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
          {/* Header Info */}
          <div className="px-8 pt-8 pb-4 flex justify-end">
            <span className="text-[11px] text-muted-foreground font-sans">
              {format(new Date(transaction.date), "MMM d, yyyy")}
            </span>
          </div>

          <div className="px-8 pb-8 space-y-1">
            <h2 className="text-xl font-sans font-medium tracking-tight text-foreground/90">
              Transaction
            </h2>
            <h1
              className={cn(
                "text-5xl font-sans tracking-tighter",
                isIncome
                  ? "text-emerald-500"
                  : isExpense
                    ? "text-red-500"
                    : "text-blue-500",
              )}
            >
              {formatCurrency(Number(transaction.amount), settings)}
            </h1>
          </div>

          <div className="px-8 space-y-8">
            {/* Category and Assign Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-sans ml-1">
                  Category
                </Label>
                <Select defaultValue={transaction.categoryId ?? "income"}>
                  <SelectTrigger className="h-10 bg-muted/20 border-border/50 font-sans text-sm focus:ring-0">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "w-2.5 h-2.5 rounded-[2px]",
                          isIncome
                            ? "bg-emerald-500"
                            : isExpense
                              ? "bg-red-500"
                              : "bg-blue-500",
                        )}
                      />
                      <SelectValue placeholder="Category" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="font-sans">
                    <SelectItem value={transaction.categoryId ?? "income"}>
                      {transaction.category?.name ?? "Income"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-sans ml-1">
                  Assign
                </Label>
                <Select defaultValue={transaction.walletId ?? ""}>
                  <SelectTrigger className="h-10 bg-muted/20 border-border/50 font-sans text-sm focus:ring-0">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="font-sans">
                    <SelectItem value={transaction.walletId ?? ""}>
                      {transaction.wallet?.name ?? "Wallet"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-sans ml-1">
                Tags
              </Label>
              <div className="min-h-[40px] p-2 rounded-md bg-muted/20 border border-border/50 flex items-center">
                <span className="text-sm text-muted-foreground/60 font-sans ml-1">
                  Select tags
                </span>
              </div>
            </div>

            {/* Accordion Sections */}
            <Accordion
              type="multiple"
              defaultValue={["attachments", "general", "note"]}
              className="w-full"
            >
              <AccordionItem value="attachments" className="border-none">
                <AccordionTrigger className="hover:no-underline py-4 text-[13px] font-sans font-medium text-foreground/80 uppercase tracking-widest">
                  Attachments
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-focus-within:text-foreground" />
                    <Input
                      placeholder="Search attachment"
                      className="pl-9 h-9 bg-muted/10 border-border/40 font-sans text-xs focus-visible:ring-0"
                    />
                  </div>
                  <div className="aspect-2/1 border border-dashed border-border/60 rounded-lg flex flex-col items-center justify-center gap-2 bg-muted/5 group hover:bg-muted/10 transition-colors cursor-pointer">
                    <p className="text-[11px] text-muted-foreground font-sans text-center px-8">
                      Drop your files here, or{" "}
                      <span className="text-foreground font-medium underline-offset-2 hover:underline">
                        click to browse
                      </span>
                      .
                      <br />
                      <span className="opacity-60 text-[10px]">
                        3MB file limit.
                      </span>
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="general" className="border-none">
                <AccordionTrigger className="hover:no-underline py-4 text-[13px] font-sans font-medium text-foreground/80 uppercase tracking-widest">
                  General
                </AccordionTrigger>
                <AccordionContent className="space-y-6 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="text-sm font-sans font-medium">
                        Exclude from reports
                      </Label>
                      <p className="text-[11px] text-muted-foreground font-sans max-w-[280px]">
                        Exclude this transaction from reports like profit,
                        expense and revenue.
                      </p>
                    </div>
                    <Switch
                      checked={excludeFromReports}
                      onCheckedChange={setExcludeFromReports}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-sans font-medium">
                      Tax amount
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        defaultValue="0"
                        className="h-9 bg-muted/10 border-border/40 font-sans text-sm focus-visible:ring-0 flex-1"
                      />
                      <Select defaultValue="IDR">
                        <SelectTrigger className="w-24 h-9 bg-muted/10 border-border/40 font-sans text-xs focus:ring-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="font-sans">
                          <SelectItem value="IDR">IDR</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="text-sm font-sans font-medium">
                        Mark as recurring
                      </Label>
                      <p className="text-[11px] text-muted-foreground font-sans max-w-[280px]">
                        Mark as recurring. Similar future transactions will be
                        automatically categorized and flagged as recurring.
                      </p>
                    </div>
                    <Switch
                      checked={markAsRecurring}
                      onCheckedChange={setMarkAsRecurring}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="note" className="border-none">
                <AccordionTrigger className="hover:no-underline py-4 text-[13px] font-sans font-medium text-foreground/80 uppercase tracking-widest">
                  Note
                </AccordionTrigger>
                <AccordionContent>
                  <Textarea
                    placeholder="Note"
                    className="min-h-[120px] bg-muted/10 border-border/40 font-sans text-sm focus-visible:ring-0 resize-none leading-relaxed"
                    defaultValue={transaction.description?.replace(
                      /<[^>]*>?/gm,
                      "",
                    )}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>

        {/* Footer Toolbar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-4rem)] bg-background/80 backdrop-blur-md border border-border/50 rounded px-4 py-2 flex items-center justify-between z-50">
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 group">
              <Kbd className="bg-muted/30 border-none text-[10px] h-5 min-w-[20px]">
                ⌘ M
              </Kbd>
              <span className="text-xs font-sans text-muted-foreground group-hover:text-foreground transition-colors">
                Mark ready
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-muted/30 rounded-lg p-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md hover:bg-background shadow-none"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md hover:bg-background shadow-none"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-2 group px-2"
            >
              <span className="text-xs font-sans text-muted-foreground group-hover:text-foreground transition-colors">
                Esc
              </span>
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
