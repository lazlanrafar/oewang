"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  Cpu,
  Database,
  ArrowUpRight,
  Clock,
  Coins,
} from "lucide-react";

const tokenUsageData = [
  { date: "Sep 01", promptTokens: 12400, completionTokens: 4200, totalTokens: 16600 },
  { date: "Sep 02", promptTokens: 14200, completionTokens: 5100, totalTokens: 19300 },
  { date: "Sep 03", promptTokens: 18900, completionTokens: 6800, totalTokens: 25700 },
  { date: "Sep 04", promptTokens: 15400, completionTokens: 5300, totalTokens: 20700 },
  { date: "Sep 05", promptTokens: 22100, completionTokens: 7900, totalTokens: 30000 },
  { date: "Sep 06", promptTokens: 24500, completionTokens: 8900, totalTokens: 33400 },
  { date: "Sep 07", promptTokens: 28900, completionTokens: 10400, totalTokens: 39300 },
  { date: "Sep 08", promptTokens: 31200, completionTokens: 11200, totalTokens: 42400 },
  { date: "Sep 09", promptTokens: 35400, completionTokens: 12800, totalTokens: 48200 },
];

const modelDistributionData = [
  { model: "gpt-4o-mini", requests: 1420, avgLatency: 420, cost: "$1.42" },
  { model: "gpt-4o", requests: 580, avgLatency: 890, cost: "$8.70" },
  { model: "claude-3-5-sonnet", requests: 840, avgLatency: 750, cost: "$12.60" },
  { model: "text-embedding-3-small", requests: 3890, avgLatency: 120, cost: "$0.08" },
];

const latencyByTaskData = [
  { task: "Transaction Categorization", p50: 240, p95: 580, p99: 920 },
  { task: "Receipt OCR Extraction", p50: 1250, p95: 2400, p99: 3800 },
  { task: "RAG Semantic Search", p50: 180, p95: 410, p99: 650 },
  { task: "Financial Assistant Chat", p50: 620, p95: 1400, p99: 2100 },
];

const chartConfig = {
  promptTokens: {
    label: "Prompt Tokens",
    color: "var(--primary)",
  },
  completionTokens: {
    label: "Completion Tokens",
    color: "#10b981",
  },
  p50: {
    label: "P50 Latency (ms)",
    color: "var(--primary)",
  },
  p95: {
    label: "P95 Latency (ms)",
    color: "#f59e0b",
  },
  p99: {
    label: "P99 Latency (ms)",
    color: "#ef4444",
  },
};

export function AiUsageClient() {
  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="font-semibold text-lg tracking-tight uppercase">AI Usage & Inference Metrics</h1>
        <p className="text-muted-foreground text-xs">
          Comprehensive telemetry of LLM token consumption, latency benchmarks, vector embeddings, and OCR jobs.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-none border bg-background shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <span className="font-medium text-[9px] text-muted-foreground uppercase tracking-[0.2em]">Total Tokens Consumed</span>
            <Cpu className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="font-bold text-xl">275,600</div>
            <p className="text-emerald-500 text-[10px] flex items-center gap-1 mt-1 font-medium">
              <ArrowUpRight className="size-3" /> +18.4% vs last period
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-none border bg-background shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <span className="font-medium text-[9px] text-muted-foreground uppercase tracking-[0.2em]">Estimated Inference Cost</span>
            <Coins className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="font-bold text-xl">$22.80</div>
            <p className="text-muted-foreground text-[10px] mt-1">Across 4 providers</p>
          </CardContent>
        </Card>

        <Card className="rounded-none border bg-background shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <span className="font-medium text-[9px] text-muted-foreground uppercase tracking-[0.2em]">P95 Pipeline Latency</span>
            <Clock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="font-bold text-xl">840 ms</div>
            <p className="text-emerald-500 text-[10px] flex items-center gap-1 mt-1 font-medium">
              -45ms latency reduction
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-none border bg-background shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <span className="font-medium text-[9px] text-muted-foreground uppercase tracking-[0.2em]">Indexed Vectors (pgvector)</span>
            <Database className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="font-bold text-xl">3,890</div>
            <p className="text-muted-foreground text-[10px] mt-1">1536-dim vector store</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Token Growth Area Chart */}
        <Card className="rounded-none border bg-background shadow-none lg:col-span-2">
          <CardHeader className="border-b p-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider">Token Ingestion & Generation Trend</CardTitle>
            <CardDescription className="text-[11px]">Daily Prompt vs Completion tokens processed</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-6">
            <ChartContainer config={chartConfig} className="h-[260px] w-full">
              <AreaChart data={tokenUsageData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="promptGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="completionGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="promptTokens" name="Prompt Tokens" stroke="var(--primary)" fill="url(#promptGradient)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="completionTokens" name="Completion Tokens" stroke="#10b981" fill="url(#completionGradient)" strokeWidth={1.5} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Model Breakdown Table */}
        <Card className="rounded-none border bg-background shadow-none">
          <CardHeader className="border-b p-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider">Model Distribution</CardTitle>
            <CardDescription className="text-[11px]">Usage share & latency by model</CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {modelDistributionData.map((item) => (
              <div key={item.model} className="flex flex-col border-b pb-2 last:border-0 last:pb-0 text-xs">
                <div className="flex justify-between items-center font-medium">
                  <span>{item.model}</span>
                  <span className="font-mono text-muted-foreground">{item.cost}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1">
                  <span>{item.requests.toLocaleString()} reqs</span>
                  <span>avg {item.avgLatency}ms</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Latency by Task */}
      <Card className="rounded-none border bg-background shadow-none">
        <CardHeader className="border-b p-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider">Pipeline Latency Benchmarks (ms)</CardTitle>
          <CardDescription className="text-[11px]">P50 / P95 / P99 latency percentiles across AI sub-tasks</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-6">
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <BarChart data={latencyByTaskData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey="task" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="p50" stackId="latency" name="P50 Latency (ms)" fill="var(--primary)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="p95" stackId="latency" name="P95 Latency (ms)" fill="#f59e0b" radius={[0, 0, 0, 0]} />
              <Bar dataKey="p99" stackId="latency" name="P99 Latency (ms)" fill="#ef4444" radius={[0, 0, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
