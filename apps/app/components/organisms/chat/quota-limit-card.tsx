"use client";

import Link from "next/link";

import type { Dictionary } from "@workspace/dictionaries";
import { Button, cn } from "@workspace/ui";
import { AnimatePresence, motion } from "framer-motion";
import { Zap } from "lucide-react";

import { useAiQuota } from "@/hooks/use-ai-quota";
import { useLocalizedRoute } from "@/utils/localized-route";

export function QuotaLimitCard({ dictionary }: { dictionary: Dictionary }) {
  const { quota, isExceeded, loading } = useAiQuota();
  const { getLocalizedUrl } = useLocalizedRoute();

  if (loading || !isExceeded || !quota) return null;

  const dict = dictionary.ai || {
    quota_limit_title: "AI Limit Reached",
    quota_limit_description: "Your workspace has reached its monthly AI token limit.",
    quota_reset_message: "Your tokens will reset on {date}.",
    upgrade_button: "Upgrade Plan",
  };

  const resetDate = quota.plan_current_period_end
    ? new Date(quota.plan_current_period_end).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : new Date(new Date(quota.created_at).setMonth(new Date().getMonth() + 1)).toLocaleDateString(undefined, {
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
        className="mx-auto mb-6 w-full px-4"
      >
        <div
          className={cn(
            "group relative overflow-hidden transition-all duration-500",
            "bg-background",
            "border border-border/50 p-6 shadow-2xl backdrop-blur-xl",
          )}
        >
          {/* Subtle Accent Glow */}
          <div className="-top-24 -right-24 pointer-events-none absolute h-48 w-48 rounded-full bg-foreground/10 blur-3xl transition-all duration-700 group-hover:bg-red-500/20 dark:bg-foreground/5" />

          <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="max-w-md text-muted-foreground text-sm leading-relaxed">{dict.quota_limit_description}</p>
                <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors">
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
