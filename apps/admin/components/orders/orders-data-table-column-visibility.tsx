"use client";

import { useOrdersStore } from "@/stores/orders";
import { DataTableColumnsVisibility } from "@workspace/ui";

export default function OrdersDataTableColumnVisibility() {
  const { columns } = useOrdersStore();

  return <DataTableColumnsVisibility columns={columns} />;
}
