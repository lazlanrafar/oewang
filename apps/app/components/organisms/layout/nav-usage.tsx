"use client";

import { Progress } from "@workspace/ui";
import { formatBytes } from "@workspace/utils";

import type { AppDictionary } from "@/modules/types/dictionary";
import { useAppStore } from "@/stores/app";

type WorkspaceData = {
  ai_tokens_used?: number;
  vault_size_used_bytes?: number;
  max_ai_tokens?: number | null;
  max_vault_size_mb?: number | null;
};

export function NavUsage({
  workspace,
  dictionary: _dictionary,
}: {
  readonly workspace: WorkspaceData | undefined;
  readonly dictionary: AppDictionary;
}) {
  const aiQuota = useAppStore((state) => state.aiQuota);
  if (!workspace) return null;

  const maxAiTokens = aiQuota?.maxTokens ?? workspace.max_ai_tokens ?? 0;
  const aiTokensUsed = aiQuota?.used ?? workspace.ai_tokens_used ?? 0;
  const aiTokenPercentage =
    maxAiTokens > 0 ? (aiTokensUsed / maxAiTokens) * 100 : 0;
  const aiUsageLabel = `${new Intl.NumberFormat().format(aiTokensUsed)} / ${new Intl.NumberFormat().format(maxAiTokens)}`;

  const maxVaultBytes = (workspace.max_vault_size_mb ?? 0) * 1024 * 1024;
  const vaultBytesUsed = workspace.vault_size_used_bytes ?? 0;
  const vaultPercentage =
    maxVaultBytes > 0 ? (vaultBytesUsed / maxVaultBytes) * 100 : 0;
  const vaultUsageLabel = `${formatBytes(vaultBytesUsed)} / ${formatBytes(maxVaultBytes)}`;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 border-t border-b">
      {maxAiTokens > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold">AI Usage</span>
              <span className="font-medium text-[10px] normal-case tabular-nums">
                {aiUsageLabel}
              </span>
            </div>
            <span className="tabular-nums font-medium">
              {Math.round(aiTokenPercentage)}%
            </span>
          </div>
          <Progress
            value={Math.min(aiTokenPercentage, 100)}
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
              <span className="font-medium text-[10px] normal-case tabular-nums">
                {vaultUsageLabel}
              </span>
            </div>
            <span className="tabular-nums font-medium">
              {Math.round(vaultPercentage)}%
            </span>
          </div>
          <Progress
            value={Math.min(vaultPercentage, 100)}
            className="h-1 rounded-none"
            indicatorClassName="bg-primary/80"
          />
        </div>
      )}
    </div>
  );
}
