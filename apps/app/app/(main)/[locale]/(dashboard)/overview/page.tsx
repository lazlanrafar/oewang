import { TabsContent, TabsList, TabsTrigger } from "@workspace/ui";
import { Grid2X2, LineChart } from "lucide-react";

import {
  getBurnRateMetrics,
  getCategoryBreakdown,
  getExpenseMetrics,
  getRevenueMetrics,
} from "@workspace/modules/server";
import { getTransactionSettings } from "@workspace/modules/server";
import { getMe } from "@workspace/modules/server";
import { AiChat } from "@/components/organisms/overview/ai-chat";
import { OverviewCards } from "@/components/organisms/overview/overview-cards";
import { OverviewMetrics } from "@/components/organisms/overview/overview-metrics";
import { OverviewTabs } from "@/components/organisms/overview/overview-tabs";

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
  const initialTab =
    typeof searchParams.tab === "string" ? searchParams.tab : "overview";

  const [
    meResult,
    incomeResult,
    expenseResult,
    burnRateResult,
    settingsResult,
    expenseCategoryResult,
    incomeCategoryResult,
  ] = await Promise.all([
    getMe(),
    getRevenueMetrics(),
    getExpenseMetrics(),
    getBurnRateMetrics(),
    getTransactionSettings(),
    getCategoryBreakdown("expense"),
    getCategoryBreakdown("income"),
  ]);

  const user = meResult.success ? meResult.data?.user : null;
  const displayName = user?.name
    ? user.name.split(" ")[0]
    : (user?.email?.split("@")[0] ?? "there");

  const incomeData = incomeResult.success ? incomeResult.data! : [];
  const expenseData = expenseResult.success ? expenseResult.data! : [];
  const burnRateData = burnRateResult.success ? burnRateResult.data! : [];
  const expenseCategoryData = expenseCategoryResult.success
    ? expenseCategoryResult.data!
    : [];
  const incomeCategoryData = incomeCategoryResult.success
    ? incomeCategoryResult.data!
    : [];
  const settings = settingsResult.success ? settingsResult.data! : null;

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-6rem)] flex flex-col relative overflow-y-auto no-scrollbar pb-10">
      <div className="dashboard-greeting bg-background pt-0 pb-4 flex flex-col md:flex-row items-start md:items-center justify-between mb-4 border-b border-border/40">
        <div>
          <h1 className="text-2xl font-regular tracking-tight text-foreground">
            {getGreeting()} {displayName},
          </h1>
          <p className="mt-1 text-xm text-muted-foreground">
            here's a quick look at how things are going.
          </p>
        </div>
      </div>

      <OverviewTabs defaultTab={initialTab}>
        <div className="flex justify-end mb-4">
          <TabsList className="flex border border-border bg-muted/30 rounded-md overflow-hidden p-0 h-10 w-[240px]">
            <TabsTrigger
              value="overview"
              className="flex-1 rounded-none text-xs border-r border-border last:border-r-0 h-full data-[state=active]:bg-muted data-[state=active]:font-medium data-[state=active]:shadow-sm data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:bg-muted/50 transition-none"
            >
              <Grid2X2 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="metrics"
              className="flex-1 rounded-none text-xs h-full data-[state=active]:bg-muted data-[state=active]:font-medium data-[state=active]:shadow-sm data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:bg-muted/50 transition-none"
            >
              <LineChart className="w-4 h-4 mr-2" />
              Metrics
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex-1 mt-0">
          <OverviewCards
            revenueData={incomeData}
            expenseData={expenseData}
            categoryData={expenseCategoryData}
            settings={settings}
          />
        </TabsContent>
        <TabsContent value="metrics" className="flex-1 mt-0">
          <OverviewMetrics
            incomeData={incomeData}
            expenseData={expenseData}
            burnRateData={burnRateData}
            expenseCategoryData={expenseCategoryData}
            incomeCategoryData={incomeCategoryData}
            settings={settings}
          />
        </TabsContent>
      </OverviewTabs>

      <AiChat />
    </div>
  );
}
