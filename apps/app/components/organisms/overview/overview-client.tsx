"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useChatMessages } from "@ai-sdk-tools/store";
import { useChatInterface } from "@workspace/ui/hooks";

import { cn, Tabs, TabsList, TabsTrigger, TabsContent } from "@workspace/ui";
import { Grid2X2, LineChart } from "lucide-react";

import { OverviewCards } from "./overview-cards";
import { OverviewMetrics } from "./overview-metrics";

import { useAppStore } from "@/stores/app";

import type {
  ChartDataPoint,
  CategoryBreakdownPoint,
} from "@workspace/modules/metrics/metrics.action";
import type { TransactionSettings } from "@workspace/types";

function getGreeting(dict: any) {
  const hour = new Date().getHours();
  const greetings = dict.overview.greetings;
  if (hour < 12) return greetings.morning;
  if (hour < 17) return greetings.afternoon;
  return greetings.evening;
}

interface OverviewClientProps {
  defaultTab: string;
  displayName?: string;
  // These are only still needed for the Metrics tab
  incomeData: ChartDataPoint[];
  expenseData: ChartDataPoint[];
  burnRateData: ChartDataPoint[];
  expenseCategoryData: CategoryBreakdownPoint[];
  incomeCategoryData: CategoryBreakdownPoint[];
  settings?: any;
}

export function OverviewClient({
  defaultTab,
  displayName,
  incomeData,
  expenseData,
  burnRateData,
  expenseCategoryData,
  incomeCategoryData,
}: OverviewClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { dictionary } = useAppStore();

  const activeTab = searchParams.get("tab") || defaultTab;

  // Hide cards/metrics once a chat conversation starts
  const messages = useChatMessages();
  const { chatId } = useChatInterface();
  const isChatActive = messages.length > 0 || !!chatId;

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (!dictionary) return null;

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      className="flex flex-col flex-1"
    >
      {/* Header + tabs — fade out and collapse when chat is active */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out overflow-hidden",
          isChatActive
            ? "max-h-0 opacity-0 pointer-events-none mb-0"
            : "max-h-40 opacity-100 mb-6",
        )}
      >
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-serif">
              {getGreeting(dictionary)} {displayName},
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {dictionary.overview.descriptions[activeTab as keyof typeof dictionary.overview.descriptions]}
            </p>
          </div>

          <div className="ml-2 relative flex items-stretch bg-[#f7f7f7] dark:bg-[#131313] w-fit">
            <TabsList className="flex items-stretch h-auto p-0 bg-transparent">
              <TabsTrigger
                value="overview"
                className={cn(
                  "group relative flex items-center gap-1.5 px-3 py-1.5 text-[14px] transition-all whitespace-nowrap border border-transparent h-9 min-h-9",
                  "text-[#707070] hover:text-black bg-[#f7f7f7] dark:text-[#666666] dark:hover:text-white dark:bg-[#131313] mb-0 relative z-1",
                  "data-[state=active]:text-black data-[state=active]:bg-[#e6e6e6] dark:data-[state=active]:text-white dark:data-[state=active]:bg-[#1d1d1d] data-[state=active]:-mb-px data-[state=active]:z-10",
                )}
              >
                <Grid2X2 className="w-4 h-4" />
                {dictionary.overview.tabs.overview}
              </TabsTrigger>
              <TabsTrigger
                value="metrics"
                className={cn(
                  "group relative flex items-center gap-1.5 px-3 py-1.5 text-[14px] transition-all whitespace-nowrap border border-transparent h-9 min-h-9",
                  "text-[#707070] hover:text-black bg-[#f7f7f7] dark:text-[#666666] dark:hover:text-white dark:bg-[#131313] mb-0 relative z-1",
                  "data-[state=active]:text-black data-[state=active]:bg-[#e6e6e6] dark:data-[state=active]:text-white dark:data-[state=active]:bg-[#1d1d1d] data-[state=active]:-mb-px data-[state=active]:z-10",
                )}
              >
                <LineChart className="w-4 h-4" />
                {dictionary.overview.tabs.metrics}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
      </div>

      {/* Cards / metrics — hidden when chat is active */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out overflow-hidden",
          isChatActive
            ? "max-h-0 opacity-0 pointer-events-none"
            : "max-h-[2000px] opacity-100",
        )}
        aria-hidden={isChatActive}
      >
        {/* OverviewCards is self-fetching — no props needed */}
        <TabsContent value="overview" className="flex-1 mt-0">
          <OverviewCards />
        </TabsContent>
        <TabsContent value="metrics" className="flex-1 mt-0">
          <OverviewMetrics
            incomeData={incomeData}
            expenseData={expenseData}
            burnRateData={burnRateData}
            expenseCategoryData={expenseCategoryData}
            incomeCategoryData={incomeCategoryData}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}
