import {
  getSystemAdminUserStats,
  getSystemAdminUsers,
} from "@workspace/modules/system-admin/system-admin.action";
import type {
  SystemAdminUser,
  SystemAdminUserStats,
} from "@workspace/types";
import type { Metadata } from "next";

import { UsersClient } from "@/components/users/users-client";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

const EMPTY_STATS: SystemAdminUserStats = {
  total: 0,
  owners: 0,
  finance: 0,
  users: 0,
};

export default async function UsersPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || PAGE_LIMIT;
  const search =
    typeof searchParams.search === "string" ? searchParams.search : undefined;
  const system_role =
    typeof searchParams.system_role === "string"
      ? searchParams.system_role
      : undefined;
  const start =
    typeof searchParams.start === "string" ? searchParams.start : undefined;
  const end =
    typeof searchParams.end === "string" ? searchParams.end : undefined;

  let initialData: SystemAdminUser[] = [];
  let rowCount = 0;
  let pageCount = 1;
  let initialPage = page - 1;
  let initialStats: SystemAdminUserStats = EMPTY_STATS;

  try {
    const [usersRes, statsRes] = await Promise.all([
      getSystemAdminUsers({ page, limit, search, system_role, start, end }),
      getSystemAdminUserStats({ start, end }),
    ]);

    if (usersRes?.success) {
      initialData = usersRes.data.users;
      rowCount = usersRes.data.meta.total;
      pageCount = usersRes.data.meta.total_pages || 1;
      initialPage = (usersRes.data.meta.page || 1) - 1;
    }

    if (statsRes?.success) {
      initialStats = statsRes.data;
    }
  } catch (error) {
    console.error("Failed to fetch users page data:", error);
  }

  return (
    <div className="no-scrollbar flex h-full flex-col bg-background">
      <div className="no-scrollbar min-h-0 flex-1">
        <UsersClient
          initialData={initialData}
          rowCount={rowCount}
          pageCount={pageCount}
          initialPage={initialPage}
          pageSize={limit}
          initialStats={initialStats}
          initialStart={start ?? null}
          initialEnd={end ?? null}
        />
      </div>
    </div>
  );
}
