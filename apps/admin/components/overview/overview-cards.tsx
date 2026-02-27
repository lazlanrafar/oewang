"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, cn, Icons } from "@workspace/ui";
import { LineChart, PieChart, Receipt, TrendingUp, Wallet } from "lucide-react";

import { useAiChatStore } from "@/stores/ai-chat-store";

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
    message: "Give me a summary of my income vs expenses over the last 3 months.",
  },
  {
    icon: <PieChart className="w-3.5 h-3.5" />,
    label: "Top expenses",
    message: "What categories am I spending the most on?",
  },
];

export function OverviewCards({ onCardClick }: { onCardClick?: (message: string) => void }) {
  const sendMessageFn = useAiChatStore((state) => state.sendMessageFn);

  const handleCardClick = (message: string) => {
    if (onCardClick) {
      onCardClick(message);
    }
    if (sendMessageFn) {
      sendMessageFn(message);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors rounded-none shadow-none"
          onClick={() => handleCardClick("Show weekly insights")}
        >
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Weekly Insights</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xs text-muted-foreground">
              No new insights available. Every Monday you'll receive a summary of the previous week's performance.
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors rounded-none shadow-none"
          onClick={() => handleCardClick("Show cash runway")}
        >
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2v20" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Cash Runway
            </CardTitle>
            <CardDescription>Based on last 6 months</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl font-bold">0 months</div>
            <div className="text-xs text-muted-foreground mt-1 hover:underline">View runway</div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors rounded-none shadow-none"
          onClick={() => handleCardClick("Show cash flow analysis")}
        >
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
              Cash Flow
            </CardTitle>
            <CardDescription>Net cash position &middot; 1 year</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl font-bold">+IDR 0</div>
            <div className="text-xs text-muted-foreground mt-1 hover:underline">View cash flow analysis</div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors rounded-none shadow-none"
          onClick={() => handleCardClick("Show account balances")}
        >
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="20" height="14" x="2" y="5" rx="2" />
                <line x1="2" x2="22" y1="10" y2="10" />
              </svg>
              Account Balances
            </CardTitle>
            <CardDescription>No accounts connected</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl font-bold">IDR 0</div>
            <div className="text-xs text-muted-foreground mt-1 hover:underline">View account balances</div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors rounded-none shadow-none"
          onClick={() => handleCardClick("Show detailed profit and loss analysis")}
        >
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" x2="12" y1="20" y2="10" />
                <line x1="18" x2="18" y1="20" y2="4" />
                <line x1="6" x2="6" y1="20" y2="16" />
              </svg>
              Profit &amp; Loss
            </CardTitle>
            <CardDescription>IDR 0 &middot; 1 year &middot; Net</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 h-full flex flex-col justify-end">
            <div className="text-xs text-muted-foreground mt-6 pt-4 border-t border-border hover:underline">
              See detailed analysis
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors rounded-none shadow-none"
          onClick={() => handleCardClick("Show forecast details")}
        >
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              Forecast
            </CardTitle>
            <CardDescription>Revenue projection</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 h-full flex flex-col justify-end">
            <div className="w-full h-px bg-foreground mb-4" />
            <div className="text-xs mb-1">
              Next month projection <b>+IDR 0.00</b>
            </div>
            <div className="text-xs text-muted-foreground hover:underline">View forecast details</div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors rounded-none shadow-none"
          onClick={() => handleCardClick("Show revenue trends")}
        >
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Revenue Summary
            </CardTitle>
            <CardDescription>Net revenue &middot; 1 year</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 h-full flex flex-col justify-end">
            <div className="text-xl font-bold">IDR 0.00</div>
            <div className="text-xs text-muted-foreground mt-1 hover:underline">View revenue trends</div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors rounded-none shadow-none"
          onClick={() => handleCardClick("Show growth analysis")}
        >
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 20h.01" />
                <path d="M7 20v-4" />
                <path d="M12 20v-8" />
                <path d="M17 20V8" />
                <path d="M22 4v16" />
              </svg>
              Growth Rate
            </CardTitle>
            <CardDescription>Net revenue growth &middot; 1 year</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 h-full flex flex-col justify-end">
            <div className="text-xl font-bold">0.0%</div>
            <div className="text-xs text-muted-foreground mt-1 hover:underline">View growth analysis</div>
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
