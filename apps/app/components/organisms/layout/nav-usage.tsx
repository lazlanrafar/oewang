"use client";

import { useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getActiveWorkspace } from "@workspace/modules/workspace/workspace.action";
import { Progress } from "@workspace/ui";
import { formatBytes } from "@workspace/utils";

import type { AppDictionary } from "@/modules/types/dictionary";
import { useAppStore } from "@/stores/app";

type WorkspaceData = {
  ai_tokens_used?: number;
  vault_size_used_bytes?: number;
  max_ai_tokens?: number | null;
  max_vault_size_mb?: number | null;
  plan?: {
    max_ai_tokens?: number | null;
    max_vault_size_mb?: number | null;
  } | null;
  extra_ai_tokens?: number | null;
  extra_vault_size_mb?: number | null;
};

const COUNTER_ANIMATION_MS = 700;

// How long workspace usage data is considered fresh.
// WebSocket events will invalidate the cache on real changes,
// so this is only a safety-net for data staleness.
const USAGE_STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes

function useAnimatedNumber(target: number, durationMs = COUNTER_ANIMATION_MS) {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [value, setValue] = useState(safeTarget);
  const frameRef = useRef<number | null>(null);
  const valueRef = useRef(safeTarget);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const from = valueRef.current;
    const delta = safeTarget - from;
    if (Math.abs(delta) < 0.0001) {
      setValue(safeTarget);
      return;
    }

    const startedAt = performance.now();
    const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      const next = from + delta * easeOutCubic(progress);
      setValue(next);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [durationMs, safeTarget]);

  return value;
}

function getMaxAiTokens(workspace: WorkspaceData) {
  if (typeof workspace.max_ai_tokens === "number") return workspace.max_ai_tokens;
  return (workspace.plan?.max_ai_tokens ?? 0) + (workspace.extra_ai_tokens ?? 0);
}

function getMaxVaultBytes(workspace: WorkspaceData) {
  const maxVaultSizeMb =
    typeof workspace.max_vault_size_mb === "number"
      ? workspace.max_vault_size_mb
      : (workspace.plan?.max_vault_size_mb ?? 0) + (workspace.extra_vault_size_mb ?? 0);
  return maxVaultSizeMb * 1024 * 1024;
}

export function NavUsage({
  workspace,
  dictionary: _dictionary,
}: {
  readonly workspace: WorkspaceData | undefined;
  readonly dictionary: AppDictionary;
}) {
  const queryClient = useQueryClient();
  const aiQuota = useAppStore((state) => state.aiQuota);
  const fetchAiQuota = useAppStore((state) => state.fetchAiQuota);
  const activeWorkspace = useAppStore((state) => state.workspace);

  // Stable ref so the WS cache-listener closure never captures a stale function.
  const fetchAiQuotaRef = useRef(fetchAiQuota);
  useEffect(() => {
    fetchAiQuotaRef.current = fetchAiQuota;
  }, [fetchAiQuota]);

  // Fetch workspace usage once on mount.
  // The existing useRealtime() hook (mounted in the dashboard layout) listens for
  // WebSocket events from the API. When the API emits "workspace.usage" (after an AI
  // call or vault upload), useRealtime calls queryClient.invalidateQueries(["workspace","active"]),
  // which triggers a fresh fetch here automatically — no polling needed.
  const { data: activeWorkspaceUsage } = useQuery({
    queryKey: ["workspace", "active"],
    queryFn: async () => {
      const result = await getActiveWorkspace();
      return result.success ? result.data : null;
    },
    staleTime: USAGE_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Hydrate AI quota once on mount.
  useEffect(() => {
    void fetchAiQuota();
  }, [fetchAiQuota]);

  // React to TanStack Query cache updates for the workspace — specifically after the
  // WebSocket invalidates ["workspace", "active"]. When that query completes a fresh
  // fetch, we also refresh the AI quota to stay in sync.
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        Array.isArray(event.query.queryKey) &&
        event.query.queryKey[0] === "workspace" &&
        event.query.queryKey[1] === "active" &&
        event.query.state.status === "success" &&
        // Only react to a successful refetch (not the initial mount fetch)
        event.query.state.fetchStatus === "idle" &&
        event.query.state.dataUpdateCount > 1
      ) {
        void fetchAiQuotaRef.current();
      }
    });

    return unsubscribe;
  }, [queryClient]);

  const resolvedWorkspace = (activeWorkspaceUsage ?? activeWorkspace ?? workspace) as WorkspaceData | null;
  const maxAiTokens = resolvedWorkspace ? (aiQuota?.maxTokens ?? getMaxAiTokens(resolvedWorkspace)) : 0;
  const aiTokensUsed = aiQuota?.used ?? resolvedWorkspace?.ai_tokens_used ?? 0;
  const targetAiTokenPercentage = maxAiTokens > 0 ? (aiTokensUsed / maxAiTokens) * 100 : 0;
  const maxVaultBytes = resolvedWorkspace ? getMaxVaultBytes(resolvedWorkspace) : 0;
  const vaultBytesUsed = resolvedWorkspace?.vault_size_used_bytes ?? 0;
  const targetVaultPercentage = maxVaultBytes > 0 ? (vaultBytesUsed / maxVaultBytes) * 100 : 0;

  const animatedAiTokensUsed = Math.round(useAnimatedNumber(aiTokensUsed));
  const animatedMaxAiTokens = Math.round(useAnimatedNumber(maxAiTokens));
  const animatedAiPercentage = useAnimatedNumber(targetAiTokenPercentage);

  const animatedVaultBytesUsed = Math.round(useAnimatedNumber(vaultBytesUsed));
  const animatedMaxVaultBytes = Math.round(useAnimatedNumber(maxVaultBytes));
  const animatedVaultPercentage = useAnimatedNumber(targetVaultPercentage);

  const aiUsageLabel = `${new Intl.NumberFormat().format(animatedAiTokensUsed)} / ${new Intl.NumberFormat().format(animatedMaxAiTokens)}`;
  const animatedVaultUsageLabel = `${formatBytes(animatedVaultBytesUsed)} / ${formatBytes(animatedMaxVaultBytes)}`;

  if (!resolvedWorkspace) return null;

  return (
    <div className="flex flex-col gap-4 border-t border-b px-4 py-4 group-data-[collapsible=icon]:hidden">
      {maxAiTokens > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold">AI Usage</span>
              <span className="font-medium text-[10px] normal-case tabular-nums">{aiUsageLabel}</span>
            </div>
            <span className="font-medium tabular-nums">{Math.round(animatedAiPercentage)}%</span>
          </div>
          <Progress
            value={Math.min(animatedAiPercentage, 100)}
            className="h-1 rounded-none"
            indicatorClassName="bg-primary/80"
          />
        </div>
      )}

      {maxVaultBytes > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold">Vault Storage</span>
              <span className="font-medium text-[10px] normal-case tabular-nums">{animatedVaultUsageLabel}</span>
            </div>
            <span className="font-medium tabular-nums">{Math.round(animatedVaultPercentage)}%</span>
          </div>
          <Progress
            value={Math.min(animatedVaultPercentage, 100)}
            className="h-1 rounded-none"
            indicatorClassName="bg-primary/80"
          />
        </div>
      )}
    </div>
  );
}
