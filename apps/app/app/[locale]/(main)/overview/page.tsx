import { TabsContent, TabsList, TabsTrigger } from "@workspace/ui";
import { Grid2X2, LineChart } from "lucide-react";

import {
  getBurnRateMetrics,
  getCategoryBreakdown,
  getExpenseMetrics,
  getRevenueMetrics,
} from "@workspace/modules";
import { getTransactionSettings } from "@workspace/modules";
import { getMe } from "@workspace/modules";
import { AiChat } from "@/components/overview/ai-chat";
import { OverviewCards } from "@/components/overview/overview-cards";
import { OverviewMetrics } from "@/components/overview/overview-metrics";
import { OverviewTabs } from "@/components/overview/overview-tabs";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const initialTab = typeof searchParams.tab === "string" ? searchParams.tab : "overview";

  const [meResult, revenueResult, expenseResult, burnRateResult, settingsResult, categoryResult] = await Promise.all([
    getMe(),
    getRevenueMetrics(),
    getExpenseMetrics(),
    getBurnRateMetrics(),
    getTransactionSettings(),
    getCategoryBreakdown("expense"),
  ]);

  const user = meResult.success ? meResult.data?.user : null;
  const displayName = user?.name ? user.name.split(" ")[0] : (user?.email?.split("@")[0] ?? "there");

  const revenueData = revenueResult.success ? revenueResult.data! : [];
  const expenseData = expenseResult.success ? expenseResult.data! : [];
  const burnRateData = burnRateResult.success ? burnRateResult.data! : [];
  const categoryData = categoryResult.success ? categoryResult.data! : [];
  const settings = settingsResult.success ? settingsResult.data! : null;

  return (
    <div className="flex flex-col min-h-full pb-50 relative">
      <div className="dashboard-greeting flex flex-col md:flex-row items-start md:items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-regular tracking-tight text-foreground">
            {getGreeting()} {displayName},
          </h1>
          <p className="mt-1 text-xm text-muted-foreground">here's a quick look at how things are going.</p>
        </div>
      </div>

      <OverviewTabs defaultTab={initialTab}>
        <div className="flex justify-end mb-4">
          <TabsList className="grid w-[200px] grid-cols-2">
            <TabsTrigger value="overview" className="flex items-center gap-2 cursor-pointer">
              <Grid2X2 className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="metrics" className="flex items-center gap-2 cursor-pointer">
              <LineChart className="w-4 h-4" />
              Metrics
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex-1 mt-0">
          <OverviewCards />
        </TabsContent>
        <TabsContent value="metrics" className="flex-1 mt-0">
          <OverviewMetrics
            revenueData={revenueData}
            expenseData={expenseData}
            burnRateData={burnRateData}
            categoryData={categoryData}
            settings={settings}
          />
        </TabsContent>
      </OverviewTabs>

      <AiChat />
    </div>
  );
}
