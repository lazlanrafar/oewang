import { Suspense } from "react";
import { getSystemAdminUsers } from "@workspace/modules";
import type { SystemAdminUser } from "@workspace/types";
import { UsersView } from "@/components/users/users-view";

export const dynamic = "force-dynamic";

export default async function UsersPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const page =
    typeof searchParams.page === "string" ? parseInt(searchParams.page) : 1;
  const limit =
    typeof searchParams.limit === "string" ? parseInt(searchParams.limit) : 10;
  const search =
    typeof searchParams.search === "string" ? searchParams.search : undefined;
  const system_role =
    typeof searchParams.system_role === "string"
      ? searchParams.system_role
      : undefined;
  const sortBy =
    typeof searchParams.sortBy === "string" ? searchParams.sortBy : undefined;
  const sortOrder =
    typeof searchParams.sortOrder === "string"
      ? (searchParams.sortOrder as "asc" | "desc")
      : undefined;

  let initialUsers: SystemAdminUser[] = [];
  let initialTotal = 0;

  try {
    const result = await getSystemAdminUsers({
      page,
      limit,
      search,
      system_role,
      sortBy,
      sortOrder,
    });

    if (result.success && result.data) {
      initialUsers = result.data.users;
      initialTotal = result.data.meta?.total ?? initialUsers.length;
    }
  } catch (error) {
    console.error("Failed to fetch initial data for users page:", error);
  }

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-6rem)] flex flex-col pb-10">
      <div className="flex-1 min-h-0">
        <Suspense
          fallback={
            <div className="p-8 text-center text-muted-foreground">
              Loading users...
            </div>
          }
        >
          <UsersView
            initialUsers={initialUsers}
            initialTotal={initialTotal}
            initialSearch={search}
            initialRole={system_role}
            initialSortBy={sortBy}
            initialSortOrder={sortOrder}
          />
        </Suspense>
      </div>
    </div>
  );
}
