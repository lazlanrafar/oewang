"use server";

import { ScrollableContent } from "@workspace/ui";
import { getSystemAdminWorkspaces, getSystemAdminPlans } from "@workspace/modules/system-admin/system-admin.action";
import { WorkspacesClient } from "@/components/workspaces/workspaces-client";

export default async function WorkspacesPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || 20;
  const search =
    typeof searchParams.search === "string" ? searchParams.search : undefined;
  
  const sortBy = 
    typeof searchParams.sortBy === "string" ? searchParams.sortBy : undefined;
  const sortOrder = 
    (searchParams.sortOrder === "asc" || searchParams.sortOrder === "desc") 
      ? searchParams.sortOrder 
      : undefined;

  // Get initial data for SSR
  const [workspacesResponse, plansResponse] = await Promise.all([
    getSystemAdminWorkspaces({
      page,
      limit,
      search,
      sortBy,
      sortOrder,
    }),
    getSystemAdminPlans(),
  ]);

  const workspaces = workspacesResponse.success ? workspacesResponse.data.workspaces : [];
  const meta = workspacesResponse.success
    ? workspacesResponse.data.meta
    : { total: 0, total_pages: 0 };
  
  const plans = plansResponse.success ? plansResponse.data : [];

  return (
    <ScrollableContent className="h-full">
      <div className="flex flex-col h-full bg-background no-scrollbar space-y-4">
        <WorkspacesClient
          initialData={workspaces}
          plans={plans}
          rowCount={meta?.total}
          pageCount={meta?.total_pages}
          initialPage={page - 1}
          pageSize={limit}
        />
      </div>
    </ScrollableContent>
  );
}
