"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@workspace/ui";
import { PricingDataTable } from "./pricing-data-table";
import type { PaginationState } from "@tanstack/react-table";
import type { Pricing } from "@workspace/types";

type Props = {
  initialData: Pricing[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
};

export default function PricingDataTableWrapper({
  initialData,
  rowCount,
  pageCount,
  initialPage,
  pageSize,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: initialPage,
    pageSize: pageSize,
  });

  const handlePaginationChange = (updater: any) => {
    const nextValue =
      typeof updater === "function" ? updater(pagination) : updater;

    setPagination(nextValue);

    const params = new URLSearchParams(searchParams);
    params.set("page", (nextValue.pageIndex + 1).toString());
    params.set("limit", nextValue.pageSize.toString());

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div
      className={cn(
        "h-full flex flex-col min-h-0",
        isPending ? "opacity-50 transition-opacity" : "",
      )}
    >
      <PricingDataTable
        data={initialData}
        pagination={pagination}
        onPaginationChange={handlePaginationChange}
        rowCount={rowCount}
        pageCount={pageCount}
      />
    </div>
  );
}
