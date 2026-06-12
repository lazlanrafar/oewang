import {
  getSystemAdminPlans,
  getSystemAdminWorkspaceStats,
  getSystemAdminWorkspaces,
} from "@workspace/modules/system-admin/system-admin.action";
import type {
  SystemAdminPlan,
  SystemAdminWorkspace,
  SystemAdminWorkspaceStats,
} from "@workspace/types";
import type { Metadata } from "next";

import { WorkspacesClient } from "@/components/workspaces/workspaces-client";

export const metadata: Metadata = { title: "Workspaces" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

const EMPTY_STATS: SystemAdminWorkspaceStats = {
  total: 0,
  active: 0,
  paid: 0,
  free: 0,
};

export default async function WorkspacesPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || PAGE_LIMIT;
  const search =
    typeof searchParams.search === "string" ? searchParams.search : undefined;
  const sortBy =
    typeof searchParams.sortBy === "string" ? searchParams.sortBy : undefined;
  const sortOrder =
    searchParams.sortOrder === "asc" || searchParams.sortOrder === "desc"
      ? searchParams.sortOrder
      : undefined;

  let initialData: SystemAdminWorkspace[] = [];
  let plans: SystemAdminPlan[] = [];
  let rowCount = 0;
  let pageCount = 1;
  let initialPage = page - 1;
  let initialStats: SystemAdminWorkspaceStats = EMPTY_STATS;

  try {
    const [workspacesRes, plansRes, statsRes] = await Promise.all([
      getSystemAdminWorkspaces({ page, limit, search, sortBy, sortOrder }),
      getSystemAdminPlans(),
      getSystemAdminWorkspaceStats(),
    ]);

    if (workspacesRes?.success) {
      initialData = workspacesRes.data.workspaces;
      rowCount = workspacesRes.data.meta.total;
      pageCount = workspacesRes.data.meta.total_pages || 1;
      initialPage = (workspacesRes.data.meta.page || 1) - 1;
    }

    if (plansRes?.success) {
      plans = plansRes.data;
    }

    if (statsRes?.success) {
      initialStats = statsRes.data;
    }
  } catch (error) {
    console.error("Failed to fetch workspaces page data:", error);
  }

  return (
    <div className="no-scrollbar flex h-full flex-col bg-background">
      <div className="no-scrollbar min-h-0 flex-1">
        <WorkspacesClient
          initialData={initialData}
          plans={plans}
          rowCount={rowCount}
          pageCount={pageCount}
          initialPage={initialPage}
          pageSize={limit}
          initialStats={initialStats}
        />
      </div>
    </div>
  );
}
