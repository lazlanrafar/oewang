"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { UserDataTable } from "./user-data-table";
import type { PaginationState } from "@tanstack/react-table";
import type { SystemAdminUser } from "@workspace/types";

type Props = {
  initialData: SystemAdminUser[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
};

export default function UserDataTableWrapper({
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
    <div className={isPending ? "opacity-50 transition-opacity" : ""}>
      <UserDataTable
        data={initialData}
        pagination={pagination}
        onPaginationChange={handlePaginationChange}
        rowCount={rowCount}
        pageCount={pageCount}
      />
    </div>
  );
}
