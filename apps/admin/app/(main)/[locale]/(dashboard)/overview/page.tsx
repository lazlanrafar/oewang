import { getMe } from "@workspace/modules/user/user.action";
import { getSystemMetricsOverview } from "@workspace/modules/server";
import { OverviewClient } from "@/components/overview/overview-client";
import { ScrollArea } from "@workspace/ui";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { start, end } = await searchParams;

  const [meResult, metricsResult] = await Promise.all([
    getMe(),
    getSystemMetricsOverview({ start, end }),
  ]);

  const user = meResult.success ? meResult.data?.user : null;
  const displayName = user?.name
    ? user.name.split(" ")[0]
    : (user?.email?.split("@")[0] ?? "there");

  const metricsData = metricsResult.success
    ? metricsResult.data
    : {
        metrics: {
          totalRevenue: 0,
          totalUsers: 0,
          totalOrders: 0,
          activeWorkspaces: 0,
        },
        chartData: [],
      };

  return (
    <ScrollArea className="flex flex-col min-h-full h-full relative space-y-8">
      <div className="dashboard-greeting flex flex-col md:flex-row items-start md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-regular tracking-tight text-foreground">
            {getGreeting()} {displayName},
          </h1>
          <p className="mt-1 text-xm text-muted-foreground">
            here's a quick look at how things are going.
          </p>
        </div>
      </div>

      <OverviewClient data={metricsData as any} />
    </ScrollArea>
  );
}
