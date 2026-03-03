"use client";

import { usePricingStore } from "@/stores/pricing";
import { DataTableColumnsVisibility } from "@workspace/ui";

export default function PricingDataTableColumnVisibility() {
  const { columns } = usePricingStore();

  return <DataTableColumnsVisibility columns={columns} />;
}
