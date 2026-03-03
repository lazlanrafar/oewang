"use client";

import { usePricingStore } from "@/stores/pricing";
import { Button, Icons } from "@workspace/ui";

export const PricingAddButton = () => {
  const { openCreate } = usePricingStore();

  return (
    <Button variant="outline" size="icon" onClick={openCreate}>
      <Icons.Add size={17} />
    </Button>
  );
};
