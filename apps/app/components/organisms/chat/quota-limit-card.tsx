"use client";

import { useAppStore } from "@/stores/app";
import { useAiQuota } from "@/hooks/use-ai-quota";
import { useLocalizedRoute } from "@/utils/localized-route";
import { Button } from "@workspace/ui";
import { Zap, AlertCircle } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@workspace/ui";

export function QuotaLimitCard() {
  const { dictionary } = useAppStore() as any;
  const { quota, isExceeded, loading } = useAiQuota();
  const { getLocalizedUrl } = useLocalizedRoute();

  if (loading || !isExceeded || !quota) return null;

  const dict = dictionary?.ai || {
    quota_limit_title: "AI Limit Reached",
    quota_limit_description:
      "Your workspace has reached its monthly AI token limit.",
    quota_reset_message: "Your tokens will reset on {date}.",
    upgrade_button: "Upgrade Plan",
  };

  const resetDate = quota.plan_current_period_end
    ? new Date(quota.plan_current_period_end).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : new Date(
        new Date(quota.created_at).setMonth(new Date().getMonth() + 1),
      ).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

  const resetMessage = dict.quota_reset_message.replace("{date}", resetDate);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: 10, filter: "blur(10px)" }}
        className="mb-6 w-full mx-auto px-4"
      >
        <div
          className={cn(
            "relative overflow-hidden group transition-all duration-500",
            "bg-background",
            "backdrop-blur-xl border border-border/50 p-6 shadow-2xl",
          )}
        >
          {/* Subtle Accent Glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-foreground/10 dark:bg-foreground/5 rounded-full blur-3xl pointer-events-none group-hover:bg-red-500/20 transition-all duration-700" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                  {dict.quota_limit_description}
                </p>
                <div className="flex items-center gap-1.5 text-[11px] font-mono transition-colors uppercase tracking-widest">
                  <Zap className="h-3 w-3 animate-pulse" />
                  {resetMessage}
                </div>
              </div>
            </div>

            <Button asChild className="w-full md:w-auto">
              <Link href={getLocalizedUrl("/upgrade")}>
                {dict.upgrade_button || "Upgrade Plan"}
                <Zap className="ml-2 h-4 w-4 fill-current" />
              </Link>
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
