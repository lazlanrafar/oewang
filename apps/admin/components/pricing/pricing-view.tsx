"use client";

import type { Pricing } from "@workspace/types";
import { DataTableServer, Button } from "@workspace/ui";
import { CheckCircle2, XCircle, Plus } from "lucide-react";
import { useState } from "react";
import { columns } from "./pricing-columns";
import { PricingDialog } from "./pricing-dialog";

export interface PricingViewProps {
  initialPricing: Pricing[];
  initialTotal?: number;
  initialSearch?: string;
  initialIsActive?: string;
  initialSortBy?: string;
  initialSortOrder?: "asc" | "desc";
  pageCount?: number;
}

const statusFilterOptions = [
  {
    label: "Active",
    value: "true",
    icon: CheckCircle2,
  },
  {
    label: "Inactive",
    value: "false",
    icon: XCircle,
  },
];

export function PricingView({
  initialPricing,
  initialTotal = 0,
  initialSearch,
  initialIsActive,
  initialSortBy,
  initialSortOrder,
  pageCount,
}: PricingViewProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const initialLimit = 10;

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Pricing Plans</h1>
        <Button onClick={() => setIsDialogOpen(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Plan
        </Button>
      </div>

      <div className="flex-1 min-h-0">
        <DataTableServer
          data={initialPricing}
          columns={columns}
          pageCount={pageCount as number}
          initialTotal={initialTotal}
          initialLimit={initialLimit}
          searchPlaceholder="Search plans..."
          filters={[
            {
              columnId: "is_active",
              title: "Status",
              options: statusFilterOptions,
            },
          ]}
          initialSearch={initialSearch}
          initialSortBy={initialSortBy}
          initialSortOrder={initialSortOrder}
          initialFilters={{ is_active: initialIsActive }}
        />
      </div>

      <PricingDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </div>
  );
}
