"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui";
import { PricingForm } from "./pricing-form";
import { usePricingStore } from "@/stores/pricing";

export function PricingSheet() {
  const { isOpen, close, mode, selectedPricing } = usePricingStore();

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent className="sm:max-w-[540px] overflow-y-auto">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle>
            {mode === "create" ? "Create Pricing Plan" : "Edit Pricing Plan"}
          </SheetTitle>
        </SheetHeader>
        <div className="px-6 pb-6">
          <PricingForm
            key={selectedPricing?.id ?? "create"}
            initialData={selectedPricing}
            onSuccess={close}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
