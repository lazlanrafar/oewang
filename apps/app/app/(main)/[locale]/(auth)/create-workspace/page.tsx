// Server wrapper — fetches pricing server-side (ENCRYPTION_KEY is available)
// then passes plans as a prop to the client form.

import { WorkspaceForm } from "@/components/organisms/auth/workspace-form";
import { getPricing } from "@workspace/modules/server";
import type { Pricing } from "@workspace/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Workspace",
};

export default async function CreateWorkspacePage() {
  let plans: Pricing[] = [];

  const result = await getPricing({
    is_active: "true",
    limit: "10",
    sortBy: "price_monthly",
    sortOrder: "asc",
  });
  if (result.success) {
    plans = result.data.pricingList;
  }

  return <WorkspaceForm plans={plans} />;
}
