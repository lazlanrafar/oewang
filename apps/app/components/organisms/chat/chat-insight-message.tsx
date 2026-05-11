"use client";

import { useCallback, useEffect, useState } from "react";

import type { InsightData } from "@workspace/constants";
import type { Dictionary } from "@workspace/dictionaries";
import { AnimatePresence, motion } from "framer-motion";
import { getDictionaryText } from "./chat-i18n";

interface InsightMessageProps {
  insight: InsightData;
  dictionary: Dictionary;
}

/**
 * Animates text appearing character by character for smooth streaming effect
 */
function StreamingText({
  text,
  baseDelay = 0,
  speed = 8, // ms per character
  className,
  onComplete,
}: {
  text: string;
  baseDelay?: number;
  speed?: number;
  className?: string;
  onComplete?: () => void;
}) {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [started, setStarted] = useState(false);

  // Handle base delay before starting
  useEffect(() => {
    const timer = setTimeout(() => {
      setStarted(true);
    }, baseDelay);
    return () => clearTimeout(timer);
  }, [baseDelay]);

  // Stream characters one by one
  useEffect(() => {
    if (!started) return;

    if (currentIndex < text.length) {
      const timer = setTimeout(() => {
        setDisplayedText(text.slice(0, currentIndex + 1));
        setCurrentIndex((prev) => prev + 1);
      }, speed);
      return () => clearTimeout(timer);
    }
    if (currentIndex === text.length && onComplete) {
      onComplete();
    }
  }, [started, currentIndex, text, speed, onComplete]);

  const isComplete = currentIndex >= text.length;

  return (
    <span className={className}>
      {displayedText}
      {!isComplete && started && (
        <motion.span
          className="ml-0.5 inline-block h-[0.9em] w-[2px] bg-primary/60 align-middle"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Number.POSITIVE_INFINITY }}
        />
      )}
    </span>
  );
}

function formatAmount({ amount, currency, locale }: { amount: number; currency: string; locale: string }) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}

function formatMetricValue(value: number, type: string, currency: string, locale: string, monthsLabel: string): string {
  if (type.includes("margin") || type.includes("rate")) {
    return `${value.toFixed(1)}%`;
  }
  if (type === "runway_months") {
    return `${value.toFixed(1)} ${monthsLabel}`;
  }
  if (type.includes("hours") || type === "hours_tracked" || type === "unbilled_hours") {
    return `${value.toFixed(1)}h`;
  }
  if (
    type.includes("invoices") ||
    type.includes("customers") ||
    type === "new_customers" ||
    type === "receipts_matched" ||
    type === "transactions_categorized"
  ) {
    return value.toLocaleString();
  }
  return formatAmount({ amount: value, currency, locale }) ?? value.toLocaleString(locale);
}

function formatChange(
  change: number,
  direction: "up" | "down" | "flat",
  currentValue?: number,
  previousValue?: number,
  labels?: {
    steady: string;
    noActivity: string;
    newActivity: string;
    turnedPositive: string;
    turnedNegative: string;
  },
): string {
  if (direction === "flat" || Math.abs(change) < 0.5) {
    return labels?.steady ?? "steady";
  }

  // Current value is zero (went to zero from something)
  if (currentValue === 0 && previousValue !== undefined && previousValue !== 0) {
    return labels?.noActivity ?? "no activity";
  }

  // Previous was zero, now has value
  if (previousValue === 0 && currentValue !== undefined && currentValue !== 0) {
    return labels?.newActivity ?? "new activity";
  }

  // Detect sign change (profit to loss or vice versa) with extreme swing
  const signChanged =
    previousValue !== undefined &&
    currentValue !== undefined &&
    ((previousValue > 0 && currentValue < 0) || (previousValue < 0 && currentValue > 0));

  if (signChanged && Math.abs(change) > 200) {
    return change > 0 ? (labels?.turnedPositive ?? "turned positive") : (labels?.turnedNegative ?? "turned negative");
  }

  // Cap at 999% for readability
  const cappedChange = Math.min(Math.abs(Math.round(change)), 999);
  const sign = direction === "up" ? "+" : "-";
  return `${sign}${cappedChange}%`;
}

// Animation variants
const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.3,
      ease: "easeOut" as const,
    },
  }),
};

const sectionVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: "easeOut" as const,
    },
  },
};

export function ChatInsightMessage({ insight, dictionary }: InsightMessageProps) {
  const content = insight.content ?? { summary: "", story: "", actions: [] };
  const selectedMetrics = insight.selectedMetrics ?? [];
  const expenseAnomalies = insight.expenseAnomalies ?? [];
  const predictions = insight.predictions ?? {};
  const activity = insight.activity ?? {};
  const currency = insight.currency;
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
  const dict = dictionary as Record<string, unknown>;
  const t = (key: string, fallback: string, params?: Record<string, string | number>) =>
    getDictionaryText(dict, key, fallback, params);
  const periodLabels = {
    weekly: t("chat.insight.period.week", "week"),
    monthly: t("chat.insight.period.month", "month"),
    quarterly: t("chat.insight.period.quarter", "quarter"),
    yearly: t("chat.insight.period.year", "year"),
  };
  const changeLabels = {
    steady: t("chat.insight.change.steady", "steady"),
    noActivity: t("chat.insight.change.no_activity", "no activity"),
    newActivity: t("chat.insight.change.new_activity", "new activity"),
    turnedPositive: t("chat.insight.change.turned_positive", "turned positive"),
    turnedNegative: t("chat.insight.change.turned_negative", "turned negative"),
  };

  // Sheet hooks for opening details, here after

  // Track streaming completion states
  const [titleComplete, setTitleComplete] = useState(false);
  const [descriptionComplete, setDescriptionComplete] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showStory, setShowStory] = useState(false);
  const [storyComplete, setStoryComplete] = useState(false);
  const [showActions, setShowActions] = useState(false);

  // First insight flag comes from backend based on actual history
  // Don't use heuristics - going from 0 revenue to positive is "new activity", not "first insight"
  const isFirstInsight = insight.isFirstInsight ?? false;

  // Get period name for change comparison text
  const periodName =
    insight.periodType === "weekly"
      ? periodLabels.weekly
      : insight.periodType === "monthly"
        ? periodLabels.monthly
        : insight.periodType === "quarterly"
          ? periodLabels.quarterly
          : periodLabels.yearly;

  // Memoize callbacks
  const handleTitleComplete = useCallback(() => setTitleComplete(true), []);
  const handleDescriptionComplete = useCallback(() => setDescriptionComplete(true), []);
  const handleStoryComplete = useCallback(() => setStoryComplete(true), []);

  // Show metrics after description completes (or title if no description)
  const hasDescription = content.summary || insight.title;
  useEffect(() => {
    const shouldShowMetrics = hasDescription ? descriptionComplete : titleComplete;
    if (shouldShowMetrics && !showMetrics) {
      const timer = setTimeout(() => setShowMetrics(true), 150);
      return () => clearTimeout(timer);
    }
  }, [titleComplete, descriptionComplete, hasDescription, showMetrics]);

  // Show story after metrics animation completes
  useEffect(() => {
    if (showMetrics && !showStory) {
      const metricsCount = Math.min(selectedMetrics.length ?? 0, 4);
      const delay = metricsCount * 100 + 300;
      const timer = setTimeout(() => setShowStory(true), delay);
      return () => clearTimeout(timer);
    }
  }, [showMetrics, showStory, selectedMetrics.length]);

  // Show actions after story completes (or metrics if no story)
  useEffect(() => {
    const shouldShowActions = content.story ? storyComplete : showStory;
    if (shouldShowActions && !showActions) {
      const timer = setTimeout(() => setShowActions(true), 150);
      return () => clearTimeout(timer);
    }
  }, [showStory, storyComplete, content.story, showActions]);

  return (
    <div className="space-y-4 py-2">
      {/* Header */}
      <div>
        <p className="mb-4 block font-medium text-[16px] text-primary">
          <StreamingText text={insight.periodLabel} baseDelay={0} speed={4} onComplete={handleTitleComplete} />
        </p>
        <AnimatePresence>
          {(content.summary || insight.title) && titleComplete && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1 text-muted-foreground text-sm">
              <StreamingText
                text={content.summary || insight.title || ""}
                baseDelay={50}
                speed={3}
                onComplete={handleDescriptionComplete}
              />
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Key Metrics Grid (Highlights) */}
      <AnimatePresence>
        {showMetrics && selectedMetrics && selectedMetrics.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            <p className="text-primary text-sm">{t("chat.insight.key_metrics", "Key Metrics")}</p>
            <div className="grid grid-cols-2 gap-3 pb-3">
              {selectedMetrics.slice(0, 4).map((metric, index) => {
                const isRunway = metric.type === "runway_months";
                // For first insight, don't show misleading "vs last week"
                const changeText = isRunway
                  ? t("chat.insight.based_on_avg_3_months", "based on 3 month avg")
                  : isFirstInsight
                    ? t("chat.insight.this_period", "this period")
                    : t("chat.insight.vs_last_period", "{change} vs last {period}", {
                        change: formatChange(
                          metric.change,
                          metric.changeDirection,
                          metric.value,
                          metric.previousValue,
                          changeLabels,
                        ),
                        period: periodName,
                      });

                return (
                  <motion.div
                    key={metric.type}
                    custom={index}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    className="border border-border bg-background p-3"
                  >
                    <p className="mb-1 text-muted-foreground text-xs">{metric.label}</p>
                    <p className="font-mono text-lg text-primary tabular-nums">
                      {formatMetricValue(
                        metric.value,
                        metric.type,
                        metric.currency || currency,
                        locale,
                        t("chat.insight.months", "months"),
                      )}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{changeText}</p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Story (Depth) */}
      <AnimatePresence>
        {showStory && content.story && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-muted-foreground text-sm leading-relaxed"
          >
            <StreamingText text={content.story} baseDelay={50} speed={3} onComplete={handleStoryComplete} />
          </motion.p>
        )}
      </AnimatePresence>

      {/* Actions */}
      <AnimatePresence>
        {showActions && content.actions && content.actions.length > 0 && (
          <motion.div variants={sectionVariants} initial="hidden" animate="visible" className="space-y-2">
            <p className="text-primary text-sm">{t("chat.insight.recommended_actions", "Recommended actions")}</p>
            <ul className="space-y-1">
              {content.actions.map((action, i) => {
                const hasLink = action.entityId && action.entityType;
                const handleClick = () => {
                  if (!action.entityId || !action.entityType) return;

                  //   switch (action.entityType) {
                  //     case "invoice":
                  //       setInvoiceParams({
                  //         invoiceId: action.entityId,
                  //         type: "details",
                  //       });
                  //       break;
                  //     case "project":
                  //       setTrackerParams({
                  //         projectId: action.entityId,
                  //         update: true,
                  //       });
                  //       break;
                  //     // Future: handle "customer", "transaction", etc.
                  //   }
                };

                return (
                  <motion.li
                    key={action.text}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.2 }}
                    className="flex items-start gap-2 text-muted-foreground text-sm"
                  >
                    <span>•</span>
                    {hasLink ? (
                      <button
                        type="button"
                        onClick={handleClick}
                        className="text-left underline-offset-2 transition-colors hover:text-primary hover:underline"
                      >
                        {action.text}
                      </button>
                    ) : (
                      <span>{action.text}</span>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overdue Alert */}
      <AnimatePresence>
        {showActions && activity.invoicesOverdue != null && activity.invoicesOverdue > 0 && (
          <motion.div variants={sectionVariants} initial="hidden" animate="visible" className="text-sm">
            <span className="font-medium">{t("chat.insight.needs_attention", "Needs attention:")}</span>{" "}
            <span className="text-muted-foreground">
              {activity.invoicesOverdue}{" "}
              {activity.invoicesOverdue > 1
                ? t("chat.insight.overdue_invoices", "overdue invoices")
                : t("chat.insight.overdue_invoice", "overdue invoice")}
              {activity.overdueAmount != null && activity.overdueAmount > 0 && (
                <span>
                  {" "}
                  (
                  {formatAmount({
                    amount: activity.overdueAmount,
                    currency,
                    locale,
                  })}
                  )
                </span>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expense Alerts (only spikes) */}
      <AnimatePresence>
        {showActions &&
          expenseAnomalies &&
          expenseAnomalies.filter((ea) => ea.type === "category_spike" || ea.type === "new_category").length > 0 && (
            <motion.div variants={sectionVariants} initial="hidden" animate="visible" className="space-y-2">
              <p className="text-primary text-sm">{t("chat.insight.expense_alerts", "Expense alerts")}</p>
              <ul className="space-y-1">
                {expenseAnomalies
                  .filter((ea) => ea.type === "category_spike" || ea.type === "new_category")
                  .slice(0, 3)
                  .map((ea, i) => (
                    <motion.li
                      key={ea.categoryName}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.2 }}
                      className="flex items-start gap-2 text-muted-foreground text-sm"
                    >
                      <span>•</span>
                      <span>
                        {ea.type === "new_category" ? (
                          <>
                            {t("chat.insight.new_category_prefix", "New:")} {ea.categoryName} (
                            {formatAmount({
                              amount: ea.currentAmount,
                              currency: ea.currency,
                              locale,
                            })}
                            )
                          </>
                        ) : (
                          <>
                            {t("chat.insight.category_up_to", "{category} up {change}% to", {
                              category: ea.categoryName,
                              change: ea.change,
                            })}{" "}
                            {formatAmount({
                              amount: ea.currentAmount,
                              currency: ea.currency,
                              locale,
                            })}
                          </>
                        )}
                      </span>
                    </motion.li>
                  ))}
              </ul>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Next Week Predictions */}
      <AnimatePresence>
        {showActions && predictions.invoicesDue && predictions.invoicesDue.count > 0 && (
          <motion.div variants={sectionVariants} initial="hidden" animate="visible" className="space-y-2">
            <p className="text-primary text-sm">{t("chat.insight.next_week", "Next week")}</p>
            <p className="text-muted-foreground text-sm">
              {predictions.invoicesDue.count}{" "}
              {predictions.invoicesDue.count > 1
                ? t("chat.insight.invoices_due_plural", "invoices due")
                : t("chat.insight.invoices_due_singular", "invoice due")}{" "}
              (
              {formatAmount({
                amount: predictions.invoicesDue.totalAmount,
                currency: predictions.invoicesDue.currency,
                locale,
              })}
              )
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
