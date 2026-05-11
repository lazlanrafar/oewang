"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useChatMessages } from "@ai-sdk-tools/store";
import type { CategoryBreakdownPoint, ChartDataPoint } from "@workspace/modules/metrics/metrics.action";
import type { TransactionSettings } from "@workspace/types";
import { cn, DateRangePicker, Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui";
import { useChatInterface } from "@workspace/ui/hooks";
import { format, parseISO } from "date-fns";
import { Grid2X2, LineChart } from "lucide-react";
import type { DateRange } from "react-day-picker";

import type { AppDictionary } from "@/modules/types/dictionary";

import { OverviewCards } from "./overview-cards";
import { OverviewMetrics } from "./overview-metrics";

function getGreeting(dict: AppDictionary) {
  const hour = new Date().getHours();
  const greetings = dict.overview.greetings;
  if (hour < 12) return greetings.morning;
  if (hour < 17) return greetings.afternoon;
  return greetings.evening;
}

function formatRangeLabel(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) {
    return "Selected range";
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Selected range";
  }

  return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
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
  settings?: TransactionSettings | null;
  dictionary: AppDictionary;
  locale: string;
  startDate?: string;
  endDate?: string;
}

export function OverviewClient({
  defaultTab,
  displayName,
  incomeData,
  expenseData,
  burnRateData,
  expenseCategoryData,
  incomeCategoryData,
  dictionary,
  settings,
  locale,
  startDate,
  endDate,
}: OverviewClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab = searchParams.get("tab") || defaultTab;
  const selectedRangeLabel = formatRangeLabel(startDate, endDate);
  const selectedRange: DateRange | undefined =
    startDate && endDate
      ? {
          from: parseISO(startDate),
          to: parseISO(endDate),
        }
      : undefined;

  // Hide cards/metrics once a chat conversation starts
  const messages = useChatMessages();
  const { chatId } = useChatInterface();
  const isChatActive = messages.length > 0 || !!chatId;

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleDateRangeChange = (range?: DateRange) => {
    const params = new URLSearchParams(searchParams.toString());

    if (range?.from && !range.to) {
      return;
    }

    if (range?.from) {
      params.set("startDate", range.from.toISOString());
    } else {
      params.delete("startDate");
    }

    if (range?.to) {
      params.set("endDate", range.to.toISOString());
    } else {
      params.delete("endDate");
    }

    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (!dictionary) return null;

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-1 flex-col">
      {/* Header + tabs — fade out and collapse when chat is active */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isChatActive ? "pointer-events-none mb-0 max-h-0 opacity-0" : "mb-6 max-h-40 opacity-100",
        )}
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl">
              {getGreeting(dictionary)} {displayName},
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {dictionary.overview.descriptions[activeTab as keyof typeof dictionary.overview.descriptions]}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <DateRangePicker
              className="min-w-[250px]"
              range={selectedRange}
              onSelect={handleDateRangeChange}
              placeholder="Select date range"
            />

            <div className="relative ml-2 flex w-fit items-stretch bg-[#f7f7f7] dark:bg-[#131313]">
              <TabsList className="flex h-auto items-stretch bg-transparent p-0">
                <TabsTrigger
                  value="overview"
                  className={cn(
                    "group relative flex h-9 min-h-9 items-center gap-1.5 whitespace-nowrap border border-transparent px-3 py-1.5 text-[14px] transition-all",
                    "relative z-1 mb-0 bg-[#f7f7f7] text-[#707070] hover:text-black dark:bg-[#131313] dark:text-[#666666] dark:hover:text-white",
                    "data-[state=active]:-mb-px data-[state=active]:z-10 data-[state=active]:bg-[#e6e6e6] data-[state=active]:text-black dark:data-[state=active]:bg-[#1d1d1d] dark:data-[state=active]:text-white",
                  )}
                >
                  <Grid2X2 className="h-4 w-4" />
                  {dictionary.overview.tabs.overview}
                </TabsTrigger>
                <TabsTrigger
                  value="metrics"
                  className={cn(
                    "group relative flex h-9 min-h-9 items-center gap-1.5 whitespace-nowrap border border-transparent px-3 py-1.5 text-[14px] transition-all",
                    "relative z-1 mb-0 bg-[#f7f7f7] text-[#707070] hover:text-black dark:bg-[#131313] dark:text-[#666666] dark:hover:text-white",
                    "data-[state=active]:-mb-px data-[state=active]:z-10 data-[state=active]:bg-[#e6e6e6] data-[state=active]:text-black dark:data-[state=active]:bg-[#1d1d1d] dark:data-[state=active]:text-white",
                  )}
                >
                  <LineChart className="h-4 w-4" />
                  {dictionary.overview.tabs.metrics}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
        </div>
      </div>

      {/* Cards / metrics — hidden when chat is active */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isChatActive ? "pointer-events-none max-h-0 opacity-0" : "max-h-[2000px] opacity-100",
        )}
        aria-hidden={isChatActive}
      >
        {/* OverviewCards is self-fetching — but now needs dictionary prop */}
        <TabsContent value="overview" className="mt-0 flex-1">
          <OverviewCards dictionary={dictionary} startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="metrics" className="mt-0 flex-1">
          <OverviewMetrics
            incomeData={incomeData}
            expenseData={expenseData}
            burnRateData={burnRateData}
            expenseCategoryData={expenseCategoryData}
            incomeCategoryData={incomeCategoryData}
            dictionary={dictionary}
            settings={settings}
            locale={locale}
            rangeLabel={selectedRangeLabel}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}
