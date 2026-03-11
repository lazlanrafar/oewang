"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Icons,
} from "@workspace/ui";
import {
  LineChart,
  PieChart,
  Receipt,
  TrendingUp,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
} from "lucide-react";

import { useAiChatStore } from "@/stores/ai-chat-store";
import type {
  ChartDataPoint,
  CategoryBreakdownPoint,
} from "@workspace/modules/metrics/metrics.action";
import type { TransactionSettings } from "@workspace/types";
import { formatCurrency } from "@workspace/utils";

const SUGGESTION_CHIPS = [
  {
    icon: <Wallet className="w-3.5 h-3.5" />,
    label: "Wallet balances",
    message: "What are my current wallet balances?",
  },
  {
    icon: <LineChart className="w-3.5 h-3.5" />,
    label: "Spending analysis",
    message: "Give me a spending analysis for the last 30 days.",
  },
  {
    icon: <Receipt className="w-3.5 h-3.5" />,
    label: "Latest transactions",
    message: "Show me my latest transactions.",
  },
  {
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    label: "Monthly summary",
    message:
      "Give me a summary of my income vs expenses over the last 3 months.",
  },
  {
    icon: <PieChart className="w-3.5 h-3.5" />,
    label: "Top expenses",
    message: "What categories am I spending the most on?",
  },
];

export function OverviewCards({
  onCardClick,
  revenueData,
  expenseData,
  categoryData,
  settings,
}: {
  onCardClick?: (message: string) => void;
  revenueData?: ChartDataPoint[];
  expenseData?: ChartDataPoint[];
  categoryData?: CategoryBreakdownPoint[];
  settings?: TransactionSettings | null;
}) {
  const sendMessageFn = useAiChatStore((state) => state.sendMessageFn);

  const handleCardClick = (message: string) => {
    if (onCardClick) onCardClick(message);
    if (sendMessageFn) sendMessageFn(message);
  };

  const fmt = (v: number) => formatCurrency(v, settings);

  // Extract current month metrics (last item in the array)
  const currentRevenue = revenueData?.[revenueData.length - 1]?.current ?? 0;
  const previousRevenue =
    revenueData?.[revenueData.length - 1]?.previous ??
    revenueData?.[revenueData.length - 2]?.current ??
    0;

  const currentExpense = expenseData?.[expenseData.length - 1]?.current ?? 0;
  const previousExpense =
    expenseData?.[expenseData.length - 1]?.previous ??
    expenseData?.[expenseData.length - 2]?.current ??
    0;

  const currentNetIncome = currentRevenue - currentExpense;
  const previousNetIncome = previousRevenue - previousExpense;

  // Find the top expense category
  const topCategory = categoryData?.length
    ? categoryData.reduce((prev, current) =>
        prev.value > current.value ? prev : current,
      )
    : null;

  // Helper to render growth indicator
  const renderTrend = (
    current: number,
    previous: number,
    reverseColors = false,
  ) => {
    if (!previous && !current) return null;
    if (!previous)
      return (
        <span className="text-xs text-muted-foreground ml-2">
          No prior data
        </span>
      );

    const percentage = ((current - previous) / previous) * 100;
    const isPositive = percentage > 0;
    const isNeutral = percentage === 0;

    let colorClass = isNeutral
      ? "text-muted-foreground"
      : isPositive
        ? "text-emerald-500"
        : "text-red-500";
    if (reverseColors && !isNeutral) {
      colorClass = isPositive ? "text-red-500" : "text-emerald-500";
    }

    return (
      <span
        className={cn(
          "text-xs flex items-center ml-2 font-medium tracking-tight",
          colorClass,
        )}
      >
        {isPositive ? (
          <ArrowUpRight className="h-3 w-3 mr-0.5" />
        ) : isNeutral ? (
          <Minus className="h-3 w-3 mr-0.5" />
        ) : (
          <ArrowDownRight className="h-3 w-3 mr-0.5" />
        )}
        {Math.abs(percentage).toFixed(1)}% vs last month
      </span>
    );
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Income */}
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors rounded-none shadow-none"
          onClick={() => handleCardClick("Show revenue trends")}
        >
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center justify-between">
              Total Income
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardTitle>
            <CardDescription className="sr-only">
              Current month total income
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-serif tracking-tight font-medium">
              {fmt(currentRevenue)}
            </div>
            <div className="flex items-center mt-1">
              <span className="text-xs text-muted-foreground">This month</span>
              {renderTrend(currentRevenue, previousRevenue)}
            </div>
          </CardContent>
        </Card>

        {/* Total Expenses */}
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors rounded-none shadow-none"
          onClick={() => handleCardClick("Show spending analysis")}
        >
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center justify-between">
              Total Expenses
              <Receipt className="h-4 w-4 text-red-500" />
            </CardTitle>
            <CardDescription className="sr-only">
              Current month total expenses
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-serif tracking-tight font-medium">
              {fmt(currentExpense)}
            </div>
            <div className="flex items-center mt-1">
              <span className="text-xs text-muted-foreground">This month</span>
              {renderTrend(currentExpense, previousExpense, true)}
            </div>
          </CardContent>
        </Card>

        {/* Net Income */}
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors rounded-none shadow-none"
          onClick={() =>
            handleCardClick("Give me a summary of my income vs expenses")
          }
        >
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center justify-between">
              Net Income
              <Wallet className="h-4 w-4 text-blue-500" />
            </CardTitle>
            <CardDescription className="sr-only">
              Current month net income
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-serif tracking-tight font-medium">
              {fmt(currentNetIncome)}
            </div>
            <div className="flex items-center mt-1">
              <span className="text-xs text-muted-foreground">This month</span>
              {renderTrend(currentNetIncome, previousNetIncome)}
            </div>
          </CardContent>
        </Card>

        {/* Top Expense Category */}
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors rounded-none shadow-none flex flex-col justify-between"
          onClick={() =>
            handleCardClick("What categories am I spending the most on?")
          }
        >
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center justify-between">
              Top Expense
              <PieChart className="h-4 w-4 text-amber-500" />
            </CardTitle>
            <CardDescription className="sr-only">
              Highest expense category this month
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {topCategory ? (
              <>
                <div className="text-lg font-medium truncate">
                  {topCategory.name}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {fmt(topCategory.value)} this month
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground mt-2">
                No expenses recorded
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="w-full flex flex-wrap justify-center gap-2 mt-6">
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip.label}
            onClick={() => handleCardClick(chip.message)}
            className={cn(
              "border bg-background px-3 py-2 text-xs transition-all",
              "hover:border-primary/30 hover:bg-muted hover:text-foreground",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "flex items-center gap-1.5 text-muted-foreground",
              "cursor-pointer",
            )}
          >
            {chip.icon}
            {chip.label}
          </button>
        ))}
      </div>
    </>
  );
}
