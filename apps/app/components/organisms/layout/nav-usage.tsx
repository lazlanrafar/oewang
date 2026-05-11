"use client";

import { SidebarMenu, SidebarMenuItem, Progress } from "@workspace/ui";
import { formatBytes } from "@workspace/utils";
import type { AppDictionary } from "@/modules/types/dictionary";

type WorkspaceData = {
  ai_tokens_used?: number;
  vault_size_used_bytes?: number;
  max_ai_tokens?: number | null;
  max_vault_size_mb?: number | null;
};

export function NavUsage({
  workspace,
  dictionary,
}: {
  readonly workspace: WorkspaceData | undefined;
  readonly dictionary: AppDictionary;
}) {
  if (!workspace) return null;

  const maxAiTokens = workspace.max_ai_tokens ?? 0;
  const aiTokensUsed = workspace.ai_tokens_used ?? 0;
  const aiTokenPercentage =
    maxAiTokens > 0 ? (aiTokensUsed / maxAiTokens) * 100 : 0;

  const maxVaultBytes = (workspace.max_vault_size_mb ?? 0) * 1024 * 1024;
  const vaultBytesUsed = workspace.vault_size_used_bytes ?? 0;
  const vaultPercentage =
    maxVaultBytes > 0 ? (vaultBytesUsed / maxVaultBytes) * 100 : 0;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 border-t">
      {maxAiTokens > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground/70">
            <span className="font-bold">AI Usage</span>
            <span className="tabular-nums font-medium">
              {Math.round(aiTokenPercentage)}%
            </span>
          </div>
          <Progress 
            value={Math.min(aiTokenPercentage, 100)} 
            className="h-1 rounded-none bg-sidebar-accent/50" 
            indicatorClassName="bg-primary/80"
          />
        </div>
      )}

      {maxVaultBytes > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground/70">
            <span className="font-bold">Vault Storage</span>
            <span className="tabular-nums font-medium">
              {Math.round(vaultPercentage)}%
            </span>
          </div>
          <Progress 
            value={Math.min(vaultPercentage, 100)} 
            className="h-1 rounded-none bg-sidebar-accent/50" 
            indicatorClassName="bg-primary/80"
          />
        </div>
      )}
    </div>
  );
}
