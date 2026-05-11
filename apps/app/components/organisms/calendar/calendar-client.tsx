"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { type DebtWithContact, getDebts } from "@workspace/modules/server";
import { getTransactions } from "@workspace/modules/transaction/transaction.action";
import type { Transaction, TransactionSettings } from "@workspace/types";
import { cn } from "@workspace/ui";
import { formatCurrency as formatCurrencyUtil } from "@workspace/utils";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  getHours,
  getMinutes,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";

import { CalendarDaySheet } from "./calendar-day-sheet";
import { TransactionDetailSheet } from "../transactions/transaction-detail-sheet";

type CalendarView = "month" | "week";

/** Parse a yyyy-MM-dd string safely; fallback to today */
function parseDateParam(value: string | null): Date {
  if (!value) return new Date();
  try {
    const d = parseISO(value);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  } catch {
    return new Date();
  }
}

interface Props {
  dictionary: Dictionary;
  settings: TransactionSettings;
}

type CalendarTranslations = Dictionary["calendar"];

interface DayData {
  dayStr: string;
  dayTxs: Transaction[];
  dayDebts: DebtWithContact[];
  income: number;
  expense: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function CalendarClient({ dictionary, settings }: Props) {
  const t: CalendarTranslations = dictionary.calendar;
  const _queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | undefined>(undefined);
  const [isTransactionDetailOpen, setIsTransactionDetailOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useQueryState(
    "calendarDate",
    parseAsString.withDefault("").withOptions({ shallow: true }),
  );
  const weekScrollRef = useRef<HTMLDivElement>(null);

  // Derive state from URL
  const view: CalendarView = searchParams.get("tab") === "week" ? "week" : "month";
  const currentDate = parseDateParam(searchParams.get("date"));

  /** Push a new URL with updated params; no scroll jump */
  const setParam = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([k, v]) => {
        params.set(k, v);
      });
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setView = (v: CalendarView) => setParam({ tab: v, date: format(currentDate, "yyyy-MM-dd") });

  const setCurrentDate = (d: Date) => setParam({ tab: view, date: format(d, "yyyy-MM-dd") });

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
    queryKey: ["transactions", "calendar", format(rangeStart, "yyyy-MM-dd"), view],
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

  const transactions: Transaction[] = useMemo(() => {
    const raw = txResponse?.data;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && "rows" in raw && Array.isArray((raw as { rows?: Transaction[] }).rows)) {
      return (raw as { rows: Transaction[] }).rows;
    }
    return [];
  }, [txResponse?.data]);
  const debts: DebtWithContact[] = debtsResponse?.data || [];

  // Navigation
  const goNext = () => {
    if (view === "month") setCurrentDate(addMonths(currentDate, 1));
    else setCurrentDate(addWeeks(currentDate, 1));
  };
  const goPrev = () => {
    if (view === "month") setCurrentDate(subMonths(currentDate, 1));
    else setCurrentDate(subWeeks(currentDate, 1));
  };
  const _goToday = () => setParam({ tab: view, date: format(new Date(), "yyyy-MM-dd") });

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

  const dayDataForDate = (day: Date): DayData => {
    const dayStr = format(day, "yyyy-MM-dd");
    const dayTxs = transactions.filter((tx) => tx.date.startsWith(dayStr));
    const dayDebts = debts.filter(
      (debt) => debt.dueDate?.startsWith(dayStr) || (!debt.dueDate && debt.createdAt.startsWith(dayStr)),
    );
    let income = 0;
    let expense = 0;
    dayTxs.forEach((tx) => {
      if (tx.type === "income") income += Number(tx.amount);
      else if (tx.type === "expense") expense += Number(tx.amount);
    });
    return { dayStr, dayTxs, dayDebts, income, expense };
  };

  // Header label
  const headerLabel = useMemo(() => {
    if (view === "month") return format(currentDate, "MMMM yyyy");
    const start = startOfWeek(currentDate);
    const end = endOfWeek(currentDate);
    if (format(start, "MMM") === format(end, "MMM")) return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }, [view, currentDate]);

  const _isLoading = isLoadingTx || isLoadingDebts;

  // Tab style matching overview-tabs
  const tabClass = cn(
    "group relative flex items-center gap-1.5 px-3 py-1.5 text-[14px] transition-all whitespace-nowrap border border-transparent h-9 min-h-9 cursor-pointer select-none",
    "text-[#707070] hover:text-black bg-[#f7f7f7] dark:text-[#666666] dark:hover:text-white dark:bg-[#131313] mb-0 relative z-[1]",
  );
  const activeTabClass = cn("text-black bg-[#e6e6e6] dark:text-white dark:bg-[#1d1d1d] mb-[-1px] z-10");

  // Synchronization with URL
  useEffect(() => {
    if (calendarDate) {
      const d = parseISO(calendarDate);
      if (!Number.isNaN(d.getTime())) {
        if (!selectedDate || !isSameDay(selectedDate, d)) {
          setSelectedDate(d);
        }
      }
    } else if (selectedDate) {
      setSelectedDate(null);
    }
  }, [calendarDate, selectedDate]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!calendarDate || !selectedDate) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = addDays(selectedDate, 1);
        setCalendarDate(format(next, "yyyy-MM-dd"));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = addDays(selectedDate, -1);
        setCalendarDate(format(prev, "yyyy-MM-dd"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [calendarDate, selectedDate, setCalendarDate]);

  if (!dictionary || !t) return null;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col overflow-hidden bg-background md:h-[calc(100dvh-6rem)]">
      {/* ─── Header ─── */}
      <div className="flex items-end justify-between border-b pb-4">
        <div>
          <h1 className="font-serif text-2xl tracking-tight">{headerLabel}</h1>
          <p className="mt-0.5 text-muted-foreground text-sm">
            {view === "month"
              ? (t.description as Record<string, string>).month
              : (t.description as Record<string, string>).week}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Prev / Next */}
          <div className="flex h-9 items-center overflow-hidden border">
            <button
              type="button"
              className="flex h-full cursor-pointer items-center justify-center px-2.5 text-muted-foreground transition-colors hover:bg-muted"
              onClick={goPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="flex h-full cursor-pointer items-center justify-center border-l px-2.5 text-muted-foreground transition-colors hover:bg-muted"
              onClick={goNext}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Week / Month tabs — same style as overview tabs */}
          <div className="relative ml-1 flex items-stretch bg-[#f7f7f7] dark:bg-[#131313]">
            <button
              type="button"
              onClick={() => setView("week")}
              className={cn(tabClass, view === "week" && activeTabClass)}
            >
              <CalendarDays className="h-4 w-4" />
              {t.tabs.week}
            </button>
            <button
              type="button"
              onClick={() => setView("month")}
              className={cn(tabClass, view === "month" && activeTabClass)}
            >
              <LayoutGrid className="h-4 w-4" />
              {t.tabs.month}
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
          setSelectedDate={(d) => setCalendarDate(format(d, "yyyy-MM-dd"))}
          settings={settings}
          t={t}
        />
      ) : (
        <WeekView
          weekDays={weekDays}
          transactions={transactions}
          dayDataForDate={dayDataForDate}
          setSelectedDate={(d) => setCalendarDate(format(d, "yyyy-MM-dd"))}
          scrollRef={weekScrollRef}
          settings={settings}
          t={t}
        />
      )}

      <CalendarDaySheet
        date={selectedDate}
        open={!!selectedDate}
        onOpenChange={(op) => {
          if (!op) setCalendarDate("");
        }}
        transactions={transactions.filter(
          (tx) => selectedDate && tx.date.startsWith(format(selectedDate, "yyyy-MM-dd")),
        )}
        debts={debts.filter(
          (debt) =>
            selectedDate &&
            (debt.dueDate?.startsWith(format(selectedDate, "yyyy-MM-dd")) ||
              (!debt.dueDate && debt.createdAt.startsWith(format(selectedDate, "yyyy-MM-dd")))),
        )}
        dictionary={dictionary}
        settings={settings}
        onTransactionClick={(transaction) => {
          setSelectedTransaction(transaction);
          setIsTransactionDetailOpen(true);
        }}
      />

      <TransactionDetailSheet
        open={isTransactionDetailOpen}
        onOpenChange={(open) => {
          setIsTransactionDetailOpen(open);
          if (!open) setSelectedTransaction(undefined);
        }}
        transaction={selectedTransaction}
        dictionary={dictionary}
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

  setSelectedDate,
  settings,
  t,
}: {
  currentDate: Date;
  monthDays: Date[];
  dayDataForDate: (d: Date) => DayData;

  setSelectedDate: (d: Date) => void;
  settings: TransactionSettings;
  t: CalendarTranslations;
}) {
  const formatCurrency = (amount: number, options?: Parameters<typeof formatCurrencyUtil>[2]) =>
    formatCurrencyUtil(amount, settings, options);
  const DAY_LABELS = [
    t.days.short.sun,
    t.days.short.mon,
    t.days.short.tue,
    t.days.short.wed,
    t.days.short.thu,
    t.days.short.fri,
    t.days.short.sat,
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid shrink-0 grid-cols-7 border-b bg-background">
        {DAY_LABELS.map((d: string) => (
          <div key={d} className="px-4 py-2.5 font-semibold text-muted-foreground text-xs tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Scrollable month grid */}
      <div className="no-scrollbar flex-1 overflow-y-auto">
        <div className="grid auto-rows-[minmax(110px,1fr)] grid-cols-7">
          {monthDays.map((day, i) => {
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isToday = isSameDay(day, new Date());
            const { dayStr, income, expense, dayDebts } = dayDataForDate(day);

            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: calendar grid cell
              // biome-ignore lint/a11y/noStaticElementInteractions: calendar grid cell
              <div
                key={dayStr}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "group flex cursor-pointer flex-col gap-1 border-r border-b p-2.5 transition-colors",
                  !isCurrentMonth ? "bg-muted/20 text-muted-foreground/40" : "bg-background hover:bg-muted/20",
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
                    "flex h-6 w-6 items-center justify-center rounded-full font-medium text-sm",
                    isToday ? "bg-primary text-primary-foreground" : "text-foreground group-hover:bg-muted",
                  )}
                >
                  {format(day, "d")}
                </span>

                <div className="mt-0.5 flex flex-col gap-0.5 overflow-hidden">
                  {income > 0 && (
                    <div className="truncate rounded bg-emerald-500/10 px-1.5 py-0.5 font-medium text-[10px] text-emerald-600 sm:text-[11px] dark:text-emerald-400">
                      +{formatCurrency(income)}
                    </div>
                  )}
                  {expense > 0 && (
                    <div className="truncate rounded bg-red-500/10 px-1.5 py-0.5 font-medium text-[10px] text-red-600 sm:text-[11px] dark:text-red-400">
                      -{formatCurrency(expense)}
                    </div>
                  )}
                  {dayDebts.length > 0 && (
                    <div className="truncate rounded bg-amber-500/10 px-1.5 py-0.5 font-medium text-[10px] text-amber-600 sm:text-[11px] dark:text-amber-400">
                      {dayDebts.length === 1
                        ? t.activity.debt.replace("{count}", "1")
                        : t.activity.debts.replace("{count}", dayDebts.length.toString())}
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

  dayDataForDate,

  setSelectedDate,
  scrollRef,
  settings,
  t,
}: {
  weekDays: Date[];
  transactions: Transaction[];

  dayDataForDate: (d: Date) => DayData;

  setSelectedDate: (d: Date) => void;
  settings: TransactionSettings;
  t: CalendarTranslations;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const formatCurrency = (amount: number, options?: Parameters<typeof formatCurrencyUtil>[2]) =>
    formatCurrencyUtil(amount, settings, options);
  const today = new Date();
  const nowHour = getHours(today);
  const nowMin = getMinutes(today);
  const nowPct = ((nowHour * 60 + nowMin) / (24 * 60)) * 100;

  // Group transactions by day+hour for week view
  const txByKey: Record<string, Transaction[]> = {};
  transactions.forEach((tx) => {
    if (!tx.date) return;
    const d = new Date(tx.date);
    const key = `${format(d, "yyyy-MM-dd")}_${getHours(d)}`;
    if (!txByKey[key]) txByKey[key] = [];
    txByKey[key].push(tx);
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Sticky day header */}
      <div className="flex shrink-0 border-b bg-background">
        {/* Time gutter */}
        <div className="w-14 shrink-0" />
        {weekDays.map((day) => {
          const isToday = isSameDay(day, today);
          const { income, expense, dayDebts } = dayDataForDate(day);
          const hasActivity = income > 0 || expense > 0 || dayDebts.length > 0;

          return (
            <button
              type="button"
              key={format(day, "yyyy-MM-dd")}
              className={cn(
                "m-0 flex flex-1 cursor-pointer appearance-none flex-col items-center gap-0.5 border-l bg-transparent p-0 px-2 py-2.5 transition-colors hover:bg-muted/30",
                isToday && "bg-primary/5",
              )}
              onClick={() => setSelectedDate(day)}
            >
              <span className="font-semibold text-[11px] text-muted-foreground tracking-wider">
                {
                  [
                    t.days.short.sun,
                    t.days.short.mon,
                    t.days.short.tue,
                    t.days.short.wed,
                    t.days.short.thu,
                    t.days.short.fri,
                    t.days.short.sat,
                  ][day.getDay()]
                }
              </span>
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full font-semibold text-lg leading-none",
                  isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>
              {hasActivity && (
                <div className="mt-0.5 flex gap-0.5">
                  {income > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                  {expense > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                  {dayDebts.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="no-scrollbar relative flex-1 overflow-y-auto">
        <div className="relative flex" style={{ minHeight: `${24 * 60}px` }}>
          {/* Time labels gutter */}
          <div className="relative w-14 shrink-0">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-0 left-0 flex items-start justify-end pr-2"
                style={{ top: `${(h / 24) * 100}%`, height: `${100 / 24}%` }}
              >
                {h > 0 && (
                  <span className="-translate-y-2 text-[10px] text-muted-foreground">{h < 10 ? `0${h}` : h}:00</span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => {
            const dayStr = format(day, "yyyy-MM-dd");
            const isToday = isSameDay(day, today);

            return (
              <button
                type="button"
                key={dayStr}
                className={cn(
                  "relative m-0 block flex-1 cursor-pointer appearance-none border-l border-none bg-transparent p-0 text-left",
                  isToday && "bg-primary/[0.03]",
                )}
                onClick={() => setSelectedDate(day)}
              >
                {/* Hour row lines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute right-0 left-0 border-border/40 border-t"
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
                    className="absolute right-0 left-0 border-border/20 border-t border-dashed"
                    style={{ top: `${((h + 0.5) / 24) * 100}%` }}
                  />
                ))}

                {/* Transaction chips */}
                {Object.entries(txByKey)
                  .filter(([k]) => k.startsWith(dayStr))
                  .map(([k, txs]) => {
                    const hour = parseInt(k.split("_")[1] ?? "0", 10);
                    let income = 0;
                    let expense = 0;
                    txs.forEach((t) => {
                      if (t.type === "income") income += Number(t.amount);
                      else if (t.type === "expense") expense += Number(t.amount);
                    });
                    return (
                      <div
                        key={k}
                        className="absolute right-1 left-1 z-10 mx-0.5 overflow-hidden rounded px-1.5 py-0.5 font-medium text-[10px]"
                        style={{
                          top: `calc(${(hour / 24) * 100}% + 2px)`,
                          minHeight: 20,
                          background: income > 0 ? "rgb(16 185 129 / 0.15)" : "rgb(239 68 68 / 0.15)",
                          color: income > 0 ? "rgb(5 150 105)" : "rgb(220 38 38)",
                          borderLeft: `2px solid ${income > 0 ? "rgb(16 185 129)" : "rgb(239 68 68)"}`,
                        }}
                      >
                        {income > 0 ? `+${formatCurrency(income)}` : `-${formatCurrency(expense)}`}
                      </div>
                    );
                  })}
              </button>
            );
          })}

          {/* Current time indicator (only for today's column) */}
          {weekDays.some((d) => isSameDay(d, today)) && (
            <div
              className="pointer-events-none absolute right-0 left-14 z-20 flex items-center"
              style={{ top: `${nowPct}%` }}
            >
              <div className="ml-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="h-px flex-1 bg-primary opacity-60" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
