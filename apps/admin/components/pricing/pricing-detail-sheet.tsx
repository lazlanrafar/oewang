"use client";

import { usePricingStore } from "@/stores/pricing";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Kbd,
  Label,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  cn,
} from "@workspace/ui";
import { formatCurrency } from "@workspace/utils";
import { format } from "date-fns";
import { Copy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export function PricingDetailSheet() {
  const { isDetailOpen, closeDetail, selectedPricing } = usePricingStore();

  if (!selectedPricing) return null;

  const copyId = () => {
    navigator.clipboard.writeText(selectedPricing.id);
    toast.success("ID copied to clipboard");
  };

  const defaultValue = ["features", "stripe"];

  return (
    <Sheet open={isDetailOpen} onOpenChange={closeDetail}>
      <SheetContent
        className="sm:max-w-lg border-l bg-background p-0 flex flex-col h-full shadow-2xl"
        showCloseButton={false}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Pricing Details</SheetTitle>
        </SheetHeader>
        <div className="h-[calc(100vh)] scrollbar-hide overflow-auto pb-12 px-6 pt-6">
          <div className="flex justify-between mb-8">
            <div className="flex-1 flex-col">
              <div className="flex items-center justify-between">
                <span className="text-[#606060] text-xs select-text flex items-center gap-2">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      selectedPricing.is_active
                        ? "bg-[#00C969]"
                        : "bg-muted-foreground",
                    )}
                  />
                  {selectedPricing.is_active ? "Active Plan" : "Inactive Plan"}
                </span>
                <span className="text-[#606060] text-xs select-text">
                  {selectedPricing.created_at
                    ? format(new Date(selectedPricing.created_at), "MMM d, y")
                    : "Date unknown"}
                </span>
              </div>

              <h2 className="mt-6 mb-3 select-text text-xl font-medium">
                {selectedPricing.name}
              </h2>

              <div className="flex justify-between items-center">
                <div className="flex flex-col w-full space-y-1">
                  <span
                    className={cn(
                      "text-4xl select-text font-serif",
                      (selectedPricing.price_monthly ??
                        selectedPricing.price_yearly ??
                        selectedPricing.price_one_time ??
                        0) > 0 && "text-[#00C969]",
                    )}
                  >
                    {formatCurrency(
                      (selectedPricing.price_monthly ??
                        selectedPricing.price_yearly ??
                        selectedPricing.price_one_time ??
                        0) / 100,
                      {
                        currency: selectedPricing.currency,
                      },
                    )}
                  </span>
                  <div className="h-3">
                    <span className="text-[#606060] text-xs select-text">
                      {selectedPricing.price_monthly !== null &&
                      selectedPricing.price_monthly !== undefined
                        ? "Monthly amount"
                        : selectedPricing.price_yearly !== null &&
                            selectedPricing.price_yearly !== undefined
                          ? "Yearly amount"
                          : selectedPricing.price_one_time !== null &&
                              selectedPricing.price_one_time !== undefined
                            ? "One-time amount"
                            : "Amount"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {selectedPricing.description && (
            <div className="border dark:bg-[#1A1A1A]/95 px-4 py-3 text-sm text-popover-foreground select-text mb-6 rounded-md bg-muted/20">
              {selectedPricing.description}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mt-6 mb-2">
            <div>
              <Label
                htmlFor="currency"
                className="mb-2 block text-muted-foreground"
              >
                Currency
              </Label>
              <div className="h-[36px] flex items-center border border-border/60 rounded-md px-3 text-sm font-mono bg-muted/10">
                {selectedPricing.currency}
              </div>
            </div>

            <div>
              <Label
                htmlFor="monthly"
                className="mb-2 block text-muted-foreground"
              >
                Monthly Amount
              </Label>
              <div className="h-[36px] flex items-center border border-border/60 rounded-md px-3 text-sm bg-muted/10">
                {formatCurrency((selectedPricing.price_monthly ?? 0) / 100, {
                  currency: selectedPricing.currency,
                })}
              </div>
            </div>

            <div>
              <Label
                htmlFor="yearly"
                className="mb-2 block text-muted-foreground"
              >
                Yearly Amount
              </Label>
              <div className="h-[36px] flex items-center border border-border/60 rounded-md px-3 text-sm bg-muted/10">
                {formatCurrency((selectedPricing.price_yearly ?? 0) / 100, {
                  currency: selectedPricing.currency,
                })}
              </div>
            </div>

            <div>
              <Label
                htmlFor="one-time"
                className="mb-2 block text-muted-foreground"
              >
                One-Time Purchase
              </Label>
              <div className="h-[36px] flex items-center border border-border/60 rounded-md px-3 text-sm bg-muted/10">
                {formatCurrency((selectedPricing.price_one_time ?? 0) / 100, {
                  currency: selectedPricing.currency,
                })}
              </div>
            </div>
          </div>

          <Accordion
            type="multiple"
            defaultValue={defaultValue}
            className="mt-6 border-none"
          >
            <AccordionItem value="features" className="border-b-0 mb-4">
              <AccordionTrigger className="hover:no-underline font-medium text-md px-0">
                Included Features
              </AccordionTrigger>
              <AccordionContent className="select-text pt-2 px-0">
                {selectedPricing.features &&
                selectedPricing.features.length > 0 ? (
                  <div className="grid gap-2">
                    {selectedPricing.features.map((feature, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 group py-1"
                      >
                        <ShieldCheck className="h-4 w-4 text-[#00C969]" />
                        <span className="text-sm text-foreground/80">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2 italic pl-1">
                    No specific features documented.
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="stripe" className="border-b-0">
              <AccordionTrigger className="hover:no-underline font-medium text-md px-0">
                Stripe Configuration
              </AccordionTrigger>
              <AccordionContent className="select-text px-0">
                <div className="space-y-4 pt-1 mb-4">
                  {[
                    {
                      label: "Product ID",
                      description: "The Stripe Product identifier",
                      value: selectedPricing.stripe_product_id,
                    },
                    {
                      label: "Monthly Price ID",
                      description: "Billing monthly",
                      value: selectedPricing.stripe_price_id_monthly,
                    },
                    {
                      label: "Yearly Price ID",
                      description: "Billing yearly",
                      value: selectedPricing.stripe_price_id_yearly,
                    },
                    {
                      label: "One-Time Price ID",
                      description: "Billing once",
                      value: selectedPricing.stripe_price_id_one_time,
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex flex-row items-center justify-between border-b pb-4 last:border-0 last:pb-0 pt-2 first:pt-0"
                    >
                      <div className="space-y-0.5 pr-4">
                        <Label className="mb-1 block font-medium text-sm">
                          {item.label}
                        </Label>
                        <p className="text-xs text-muted-foreground font-mono">
                          {item.description}
                        </p>
                      </div>
                      <code className="text-xs font-mono bg-muted/40 border px-2 py-1 rounded truncate max-w-[150px]">
                        {item.value || "—"}
                      </code>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="mt-8 pt-4">
            <Label className="mb-2 block font-medium text-md">
              Internal Settings
            </Label>
            <div className="flex flex-row items-center justify-between border-b border-b-border/40 pb-4">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs text-muted-foreground">
                  Database internal identifier for this plan record.
                </p>
              </div>
              <button
                onClick={copyId}
                className="flex items-center gap-2 hover:text-[#00C969] transition-colors text-xs font-mono group"
              >
                <span className="opacity-80 group-hover:opacity-100">
                  {selectedPricing.id.slice(0, 12)}...
                </span>
                <Copy className="w-3 h-3 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
