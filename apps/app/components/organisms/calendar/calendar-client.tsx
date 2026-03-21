"use client";

import { useMemo, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
  getHours,
  getMinutes,
  parseISO,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  LayoutGrid,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getTransactions } from "@workspace/modules/transaction/transaction.action";
import { getDebts } from "@workspace/modules/server";
import { formatCurrency } from "@workspace/utils";
import { cn, Button } from "@workspace/ui";
import { CalendarDaySheet } from "./calendar-day-sheet";
import { useState } from "react";

type CalendarView = "month" | "week";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Parse a yyyy-MM-dd string safely; fallback to today */
function parseDateParam(value: string | null): Date {
  if (!value) return new Date();
  try {
    const d = parseISO(value);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch {
    return new Date();
  }
}

export function CalendarClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const weekScrollRef = useRef<HTMLDivElement>(null);

  // Derive state from URL
  const view: CalendarView =
    searchParams.get("tab") === "week" ? "week" : "month";
  const currentDate = parseDateParam(searchParams.get("date"));

  /** Push a new URL with updated params; no scroll jump */
  const setParam = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([k, v]) => params.set(k, v));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setView = (v: CalendarView) =>
    setParam({ tab: v, date: format(currentDate, "yyyy-MM-dd") });

  const setCurrentDate = (d: Date) =>
    setParam({ tab: view, date: format(d, "yyyy-MM-dd") });

  // Date range depending on view
  const rangeStart = useMemo(() => {
    if (view === "month") return startOfMonth(currentDate);
    return startOfWeek(currentDate); // Sunday
  }, [view, currentDate]);

  const rangeEnd = useMemo(() => {
    if (view === "month") return endOfMonth(currentDate);
    return endOfWeek(currentDate); // Saturday
  }, [view, currentDate]);

  // Fetch data
  const { data: txResponse, isLoading: isLoadingTx } = useQuery({
    queryKey: [
      "transactions",
      "calendar",
      format(rangeStart, "yyyy-MM-dd"),
      view,
    ],
    queryFn: () =>
      getTransactions({
        startDate: format(rangeStart, "yyyy-MM-dd"),
        endDate: `${format(rangeEnd, "yyyy-MM-dd")} 23:59:59`,
        limit: 1000,
      }),
  });

  const { data: debtsResponse, isLoading: isLoadingDebts } = useQuery({
    queryKey: ["debts", "calendar", format(rangeStart, "yyyy-MM-dd"), view],
    queryFn: () =>
      getDebts({
        startDate: format(rangeStart, "yyyy-MM-dd"),
        endDate: `${format(rangeEnd, "yyyy-MM-dd")} 23:59:59`,
      }),
  });

  const transactions =
    (txResponse?.data as any)?.rows || txResponse?.data || [];
  const debts = debtsResponse?.data || [];

  // Navigation
  const goNext = () => {
    if (view === "month") setCurrentDate(addMonths(currentDate, 1));
    else setCurrentDate(addWeeks(currentDate, 1));
  };
  const goPrev = () => {
    if (view === "month") setCurrentDate(subMonths(currentDate, 1));
    else setCurrentDate(subWeeks(currentDate, 1));
  };
  const goToday = () =>
    setParam({ tab: view, date: format(new Date(), "yyyy-MM-dd") });

  // Month grid days
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = endOfWeek(monthEnd);
    const ds: Date[] = [];
    let day = gridStart;
    while (day <= gridEnd) {
      ds.push(day);
      day = addDays(day, 1);
    }
    return ds;
  }, [currentDate]);

  // Week days (Sun–Sat)
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const dayDataForDate = (day: Date) => {
    const dayStr = format(day, "yyyy-MM-dd");
    const dayTxs = transactions.filter((t: any) => t.date?.startsWith(dayStr));
    const dayDebts = debts.filter(
      (d: any) =>
        (d.dueDate && d.dueDate.startsWith(dayStr)) ||
        (!d.dueDate && d.createdAt?.startsWith(dayStr)),
    );
    let income = 0;
    let expense = 0;
    dayTxs.forEach((t: any) => {
      if (t.type === "income") income += Number(t.amount);
      else if (t.type === "expense") expense += Number(t.amount);
    });
    return { dayStr, dayTxs, dayDebts, income, expense };
  };

  // Header label
  const headerLabel = useMemo(() => {
    if (view === "month") return format(currentDate, "MMMM yyyy");
    const start = startOfWeek(currentDate);
    const end = endOfWeek(currentDate);
    if (format(start, "MMM") === format(end, "MMM"))
      return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }, [view, currentDate]);

  const isLoading = isLoadingTx || isLoadingDebts;

  // Tab style matching overview-tabs
  const tabClass = cn(
    "group relative flex items-center gap-1.5 px-3 py-1.5 text-[14px] transition-all whitespace-nowrap border border-transparent h-9 min-h-9 cursor-pointer select-none",
    "text-[#707070] hover:text-black bg-[#f7f7f7] dark:text-[#666666] dark:hover:text-white dark:bg-[#131313] mb-0 relative z-[1]",
  );
  const activeTabClass = cn(
    "text-black bg-[#e6e6e6] dark:text-white dark:bg-[#1d1d1d] mb-[-1px] z-10",
  );

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-6rem)] flex flex-col bg-background overflow-hidden">
      {/* ─── Header ─── */}
      <div className="flex items-end justify-between pb-4 border-b">
        <div>
          <h1 className="text-2xl font-serif tracking-tight">{headerLabel}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {view === "month"
              ? "Monthly financial overview"
              : "Weekly financial overview"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Today button */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm"
            onClick={goToday}
          >
            Today
          </Button>

          {/* Prev / Next */}
          <div className="flex items-center border rounded-md overflow-hidden h-9">
            <button
              className="h-full px-2.5 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
              onClick={goPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              className="h-full px-2.5 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors border-l"
              onClick={goNext}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Week / Month tabs — same style as overview tabs */}
          <div className="ml-1 relative flex items-stretch bg-[#f7f7f7] dark:bg-[#131313]">
            <button
              onClick={() => setView("week")}
              className={cn(tabClass, view === "week" && activeTabClass)}
            >
              <CalendarDays className="w-4 h-4" />
              Week
            </button>
            <button
              onClick={() => setView("month")}
              className={cn(tabClass, view === "month" && activeTabClass)}
            >
              <LayoutGrid className="w-4 h-4" />
              Month
            </button>
          </div>
        </div>
      </div>

      {/* ─── Views ─── */}
      {view === "month" ? (
        <MonthView
          currentDate={currentDate}
          monthDays={monthDays}
          dayDataForDate={dayDataForDate}
          isLoading={isLoading}
          setSelectedDate={setSelectedDate}
        />
      ) : (
        <WeekView
          weekDays={weekDays}
          transactions={transactions}
          debts={debts}
          dayDataForDate={dayDataForDate}
          isLoading={isLoading}
          setSelectedDate={setSelectedDate}
          scrollRef={weekScrollRef}
        />
      )}

      <CalendarDaySheet
        date={selectedDate}
        open={!!selectedDate}
        onOpenChange={(op) => !op && setSelectedDate(null)}
        transactions={transactions.filter(
          (t: any) =>
            selectedDate &&
            t.date?.startsWith(format(selectedDate, "yyyy-MM-dd")),
        )}
        debts={debts.filter(
          (d: any) =>
            selectedDate &&
            ((d.dueDate &&
              d.dueDate.startsWith(format(selectedDate, "yyyy-MM-dd"))) ||
              (!d.dueDate &&
                d.createdAt?.startsWith(format(selectedDate, "yyyy-MM-dd")))),
        )}
      />
    </div>
  );
}

// ═══════════════════════════════════
// Month View
// ═══════════════════════════════════
function MonthView({
  currentDate,
  monthDays,
  dayDataForDate,
  isLoading,
  setSelectedDate,
}: {
  currentDate: Date;
  monthDays: Date[];
  dayDataForDate: (d: Date) => any;
  isLoading: boolean;
  setSelectedDate: (d: Date) => void;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b bg-background shrink-0">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="px-4 py-2.5 text-xs font-semibold text-muted-foreground tracking-wider"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Scrollable month grid */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="grid grid-cols-7 auto-rows-[minmax(110px,1fr)]">
          {monthDays.map((day, i) => {
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isToday = isSameDay(day, new Date());
            const { dayStr, income, expense, dayDebts } = dayDataForDate(day);

            return (
              <div
                key={dayStr}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "border-b border-r p-2.5 flex flex-col gap-1 cursor-pointer group transition-colors",
                  !isCurrentMonth
                    ? "bg-muted/20 text-muted-foreground/40"
                    : "bg-background hover:bg-muted/20",
                  i % 7 === 6 && "border-r-0",
                )}
                style={
                  !isCurrentMonth
                    ? {
                        backgroundImage:
                          "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.02) 10px, rgba(0,0,0,0.02) 11px)",
                      }
                    : {}
                }
              >
                <span
                  className={cn(
                    "text-sm font-medium h-6 w-6 flex items-center justify-center rounded-full",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground group-hover:bg-muted",
                  )}
                >
                  {format(day, "d")}
                </span>

                <div className="flex flex-col gap-0.5 mt-0.5 overflow-hidden">
                  {income > 0 && (
                    <div className="text-[10px] sm:text-[11px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 truncate">
                      +{formatCurrency(income)}
                    </div>
                  )}
                  {expense > 0 && (
                    <div className="text-[10px] sm:text-[11px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 truncate">
                      -{formatCurrency(expense)}
                    </div>
                  )}
                  {dayDebts.length > 0 && (
                    <div className="text-[10px] sm:text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 truncate">
                      {dayDebts.length} debt{dayDebts.length > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════
// Week View (hourly time grid)
// ═══════════════════════════════════
function WeekView({
  weekDays,
  transactions,
  debts,
  dayDataForDate,
  isLoading,
  setSelectedDate,
  scrollRef,
}: {
  weekDays: Date[];
  transactions: any[];
  debts: any[];
  dayDataForDate: (d: Date) => any;
  isLoading: boolean;
  setSelectedDate: (d: Date) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const today = new Date();
  const nowHour = getHours(today);
  const nowMin = getMinutes(today);
  const nowPct = ((nowHour * 60 + nowMin) / (24 * 60)) * 100;

  // Group transactions by day+hour for week view
  const txByKey: Record<string, any[]> = {};
  transactions.forEach((t: any) => {
    if (!t.date) return;
    const d = new Date(t.date);
    const key = `${format(d, "yyyy-MM-dd")}_${getHours(d)}`;
    if (!txByKey[key]) txByKey[key] = [];
    txByKey[key].push(t);
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sticky day header */}
      <div className="flex shrink-0 border-b bg-background">
        {/* Time gutter */}
        <div className="w-14 shrink-0" />
        {weekDays.map((day) => {
          const isToday = isSameDay(day, today);
          const { income, expense, dayDebts } = dayDataForDate(day);
          const hasActivity = income > 0 || expense > 0 || dayDebts.length > 0;

          return (
            <div
              key={format(day, "yyyy-MM-dd")}
              className={cn(
                "flex-1 border-l py-2.5 px-2 flex flex-col items-center gap-0.5 cursor-pointer hover:bg-muted/30 transition-colors",
                isToday && "bg-primary/5",
              )}
              onClick={() => setSelectedDate(day)}
            >
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">
                {format(day, "EEE").toUpperCase()}
              </span>
              <span
                className={cn(
                  "text-lg font-semibold h-8 w-8 flex items-center justify-center rounded-full leading-none",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>
              {hasActivity && (
                <div className="flex gap-0.5 mt-0.5">
                  {income > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  )}
                  {expense > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  )}
                  {dayDebts.length > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto no-scrollbar relative"
      >
        <div className="flex relative" style={{ minHeight: `${24 * 60}px` }}>
          {/* Time labels gutter */}
          <div className="w-14 shrink-0 relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 flex items-start justify-end pr-2"
                style={{ top: `${(h / 24) * 100}%`, height: `${100 / 24}%` }}
              >
                {h > 0 && (
                  <span className="text-[10px] text-muted-foreground -translate-y-2">
                    {h < 10 ? `0${h}` : h}:00
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => {
            const dayStr = format(day, "yyyy-MM-dd");
            const isToday = isSameDay(day, today);

            return (
              <div
                key={dayStr}
                className={cn(
                  "flex-1 border-l relative",
                  isToday && "bg-primary/[0.03]",
                )}
                onClick={() => setSelectedDate(day)}
              >
                {/* Hour row lines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-border/40"
                    style={{
                      top: `${(h / 24) * 100}%`,
                      height: `${100 / 24}%`,
                    }}
                  />
                ))}

                {/* Half-hour lines */}
                {HOURS.map((h) => (
                  <div
                    key={`half-${h}`}
                    className="absolute left-0 right-0 border-t border-border/20 border-dashed"
                    style={{ top: `${((h + 0.5) / 24) * 100}%` }}
                  />
                ))}

                {/* Transaction chips */}
                {Object.entries(txByKey)
                  .filter(([k]) => k.startsWith(dayStr))
                  .map(([k, txs]) => {
                    const hour = parseInt(k.split("_")[1] ?? "0");
                    let income = 0;
                    let expense = 0;
                    txs.forEach((t) => {
                      if (t.type === "income") income += Number(t.amount);
                      else if (t.type === "expense")
                        expense += Number(t.amount);
                    });
                    return (
                      <div
                        key={k}
                        className="absolute left-1 right-1 mx-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium z-10 overflow-hidden"
                        style={{
                          top: `calc(${(hour / 24) * 100}% + 2px)`,
                          minHeight: 20,
                          background:
                            income > 0
                              ? "rgb(16 185 129 / 0.15)"
                              : "rgb(239 68 68 / 0.15)",
                          color:
                            income > 0 ? "rgb(5 150 105)" : "rgb(220 38 38)",
                          borderLeft: `2px solid ${income > 0 ? "rgb(16 185 129)" : "rgb(239 68 68)"}`,
                        }}
                      >
                        {income > 0
                          ? `+${formatCurrency(income)}`
                          : `-${formatCurrency(expense)}`}
                      </div>
                    );
                  })}
              </div>
            );
          })}

          {/* Current time indicator (only for today's column) */}
          {weekDays.some((d) => isSameDay(d, today)) && (
            <div
              className="absolute left-14 right-0 z-20 pointer-events-none flex items-center"
              style={{ top: `${nowPct}%` }}
            >
              <div className="w-2 h-2 rounded-full bg-primary ml-0.5 shrink-0" />
              <div className="flex-1 h-px bg-primary opacity-60" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
