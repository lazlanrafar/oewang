"use client";

import { usePricingStore } from "@/stores/pricing";
import {
  ScrollArea,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Label,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  cn,
} from "@workspace/ui";
import { formatPrice } from "@workspace/utils";
import { format } from "date-fns";
import { Copy, ShieldCheck, Zap, Bot, Cloud } from "lucide-react";
import { toast } from "sonner";

export function PricingDetailSheet() {
  const { isDetailOpen, closeDetail, selectedPricing } = usePricingStore();

  if (!selectedPricing) return null;

  const copyId = () => {
    navigator.clipboard.writeText(selectedPricing.id);
    toast.success("ID copied to clipboard");
  };

  const defaultValue = ["features"];

  return (
    <Sheet open={isDetailOpen} onOpenChange={closeDetail}>
      <SheetContent>
        <SheetHeader className="sr-only">
          <SheetTitle>Pricing Details</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-full">
          <div className="">
            <div className="flex justify-between mb-8">
              <div className="flex-1 flex-col">
                <div className="flex items-center justify-between">
                  <div></div>
                  <span className="text-[#606060] text-xs select-text">
                    {selectedPricing.created_at
                      ? format(new Date(selectedPricing.created_at), "MMM d, y")
                      : "Date unknown"}
                  </span>
                </div>

                <h2 className="mt-6 select-text text-xl font-medium">
                  {selectedPricing.name}
                </h2>
              </div>
            </div>

            {selectedPricing.description && (
              <div className="border dark:bg-[#1A1A1A]/95 px-4 py-3 text-sm text-popover-foreground select-text mb-6  bg-muted/20">
                {selectedPricing.description}
              </div>
            )}

            <Label className="mb-2 mt-6 block font-medium text-md text-foreground">
              Pricing Options
            </Label>

            {selectedPricing.prices && selectedPricing.prices.length > 0 ? (
              <div className="grid gap-3 mb-6">
                {selectedPricing.prices.map((price, i) => (
                  <div
                    key={i}
                    className="border border-border/60 p-3 bg-muted/10"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold uppercase tracking-wider text-sm">
                        {price.currency}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex flex-col">
                        <span className="text-muted-foreground text-xs">
                          Monthly
                        </span>
                        <span className="font-serif">
                          {formatPrice(price.monthly, price.currency)}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-muted-foreground text-xs">
                          Yearly
                        </span>
                        <span className="font-serif">
                          {formatPrice(price.yearly, price.currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-border/60 p-3 bg-muted/10 mb-6 text-sm italic text-muted-foreground">
                Free Plan (No pricing defined)
              </div>
            )}

            <div className="mt-8 mb-4">
              <Label className="block font-medium text-md text-foreground">
                Quotas & Limits
              </Label>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2 p-3 bg-muted/10 border border-border/60 ">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    <Cloud className="h-3 w-3" />
                    Vault Storage
                  </div>
                  <div className="text-lg font-mono">
                    {selectedPricing.max_vault_size_mb >= 1024
                      ? `${(selectedPricing.max_vault_size_mb / 1024).toFixed(1)} GB`
                      : `${selectedPricing.max_vault_size_mb} MB`}
                  </div>
                </div>
                <div className="flex flex-col gap-2 p-3 bg-muted/10 border border-border/60 ">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    <Bot className="h-3 w-3" />
                    AI Tokens
                  </div>
                  <div className="text-lg font-mono">
                    {selectedPricing.max_ai_tokens.toLocaleString()}
                  </div>
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
                          <ShieldCheck className="h-4 w-4 text-green" />
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
                  className="flex items-center gap-2 hover:text-green transition-colors text-xs font-mono group"
                >
                  <span className="opacity-80 group-hover:opacity-100">
                    {selectedPricing.id.slice(0, 12)}...
                  </span>
                  <Copy className="w-3 h-3 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
