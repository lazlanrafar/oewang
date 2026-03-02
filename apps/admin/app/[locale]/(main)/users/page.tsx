"use server";

import { userColumns } from "@/components/users/user-columns";
import { UserDataTable } from "@/components/users/user-data-table";
import UserDataTableColumnVisibility from "@/components/users/user-data-table-column-visibility";
import UserSearchFilter from "@/components/users/user-search-filter";
import {
  getInitialTableSettings,
  ScrollableContent,
  TableSkeleton,
} from "@workspace/ui";
import { Suspense } from "react";

import { getSystemAdminUsers } from "@workspace/modules";
import UserDataTableWrapper from "@/components/users/user-data-table-wrapper";

export default async function UsersPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || 20;
  const search =
    typeof searchParams.search === "string" ? searchParams.search : undefined;

  // Get initial data for SSR
  const response = await getSystemAdminUsers({
    page,
    limit,
    search,
  });

  const users = response.success ? response.data.users : [];
  const meta = response.success
    ? response.data.meta
    : { total: 0, total_pages: 0 };

  // Get unified table settings from cookie
  const initialSettings = await getInitialTableSettings("users");

  return (
    <ScrollableContent>
      <div className="relative h-full">
        <div className="flex justify-between items-center pb-6">
          <UserSearchFilter />
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2">
              <UserDataTableColumnVisibility />
            </div>
          </div>
        </div>

        <Suspense
          fallback={
            <TableSkeleton
              columns={userColumns}
              columnVisibility={initialSettings.columns}
              columnSizing={initialSettings.sizing}
              columnOrder={initialSettings.order}
              stickyColumnIds={["name"]}
              actionsColumnId="actions"
            />
          }
        >
          <UserDataTableWrapper
            initialData={users}
            rowCount={meta.total}
            pageCount={meta.total_pages}
            initialPage={page - 1}
            pageSize={limit}
          />
        </Suspense>
      </div>
    </ScrollableContent>
  );
}
