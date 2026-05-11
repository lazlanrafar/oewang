"use client";

import { useEffect, useState } from "react";

import { useAppStore } from "@/stores/app";

export function useAiQuota() {
  const { aiQuota, fetchAiQuota, checkLimit } = useAppStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!aiQuota) {
      setLoading(true);
      fetchAiQuota().finally(() => setLoading(false));
    }
  }, [aiQuota, fetchAiQuota]);

  const { allowed, usage, limit, remaining, percent } = checkLimit("ai_tokens", 0);

  return {
    isExceeded: !allowed,
    usage,
    limit,
    remaining,
    percent,
    loading,
    quota: aiQuota,
    refresh: fetchAiQuota,
  };
}
