import { AiChat } from "@/components/overview/ai-chat";
import { OverviewCards } from "@/components/overview/overview-cards";
import { OverviewMetrics } from "@/components/overview/overview-metrics";
import { getMe } from "@/actions/user.actions";
import {
  getRevenueMetrics,
  getExpenseMetrics,
  getBurnRateMetrics,
} from "@/actions/metrics.actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui";
import { Grid2X2, LineChart } from "lucide-react";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage() {
  const [meResult, revenueResult, expenseResult, burnRateResult] =
    await Promise.all([
      getMe(),
      getRevenueMetrics(),
      getExpenseMetrics(),
      getBurnRateMetrics(),
    ]);

  const user = meResult.success ? meResult.data?.user : null;
  const displayName = user?.name
    ? user.name.split(" ")[0]
    : (user?.email?.split("@")[0] ?? "there");

  const revenueData = revenueResult.success ? revenueResult.data! : [];
  const expenseData = expenseResult.success ? expenseResult.data! : [];
  const burnRateData = burnRateResult.success ? burnRateResult.data! : [];

  return (
    <div className="flex flex-col min-h-full pb-24 relative">
      <div className="dashboard-greeting flex flex-col md:flex-row items-start md:items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-regular tracking-tight text-foreground">
            {getGreeting()} {displayName},
          </h1>
          <p className="mt-2 text-sm text-muted-foreground font-medium">
            here's a quick look at how things are going.
          </p>
        </div>
      </div>

      <Tabs
        defaultValue="overview"
        className="flex flex-col flex-1 dashboard-content-tabs"
      >
        <div className="flex justify-end mb-4">
          <TabsList className="grid w-[200px] grid-cols-2">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Grid2X2 className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="metrics" className="flex items-center gap-2">
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
          />
        </TabsContent>
      </Tabs>

      <AiChat />
    </div>
  );
}
