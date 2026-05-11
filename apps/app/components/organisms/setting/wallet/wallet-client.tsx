"use client";

import * as React from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { getWallets } from "@workspace/modules/wallet/wallet.action";
import { getWalletGroups, type WalletGroup } from "@workspace/modules/wallet-group/wallet-group.action";
import type { Wallet as WalletType } from "@workspace/types";
import { Button, Separator, Skeleton } from "@workspace/ui";
import { FolderPlus, Plus, Wallet } from "lucide-react";

import { WalletForm } from "./wallet-form";
import { WalletGroupForm } from "./wallet-group-form";

interface WalletClientProps {
  dictionary: Dictionary;
}

export function WalletClient({ dictionary }: WalletClientProps) {
  const [isWalletOpen, setIsWalletOpen] = React.useState(false);
  const [isGroupOpen, setIsGroupOpen] = React.useState(false);
  const [editingWallet, setEditingWallet] = React.useState<WalletType | null>(null);
  const [editingGroup, setEditingGroup] = React.useState<WalletGroup | null>(null);

  const _queryClient = useQueryClient();

  const { isLoading: isWalletsLoading } = useQuery({
    queryKey: ["wallets"],
    queryFn: async () => {
      const result = await getWallets();
      if (result.success) return result.data;
      throw new Error(result.message || "Failed to fetch wallets");
    },
  });

  const { isLoading: isGroupsLoading } = useQuery({
    queryKey: ["wallet-groups"],
    queryFn: async () => {
      const result = await getWalletGroups();
      if (result.success) return result.data;
      throw new Error(result.error || "Failed to fetch wallet groups");
    },
  });

  const wallets_t = dictionary.wallets;

  if (!dictionary || isWalletsLoading || isGroupsLoading || !wallets_t) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64 rounded-none" />
          <Skeleton className="h-4 w-96 rounded-none" />
        </div>
        <Separator />
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-none" />
          <Skeleton className="h-20 w-full rounded-none" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="font-medium text-2xl tracking-tight">{wallets_t?.title}</h2>
          <p className="text-muted-foreground text-sm">{wallets_t?.description}</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setEditingGroup(null);
              setIsGroupOpen(true);
            }}
            variant="outline"
            size="sm"
            className="h-8 rounded-none text-xs"
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            {wallets_t?.add_group_button}
          </Button>
          <Button
            onClick={() => {
              setEditingWallet(null);
              setIsWalletOpen(true);
            }}
            size="sm"
            className="h-8 rounded-none text-xs"
          >
            <Plus className="mr-2 h-4 w-4" />
            {wallets_t?.add_button}
          </Button>
        </div>
      </div>

      <Separator className="rounded-none" />

      <div className="grid grid-cols-1 gap-6">
        {/* Placeholder for the wallets/groups list - restored from original */}
        <div className="flex flex-col items-center justify-center space-y-4 rounded-none border border-dashed bg-accent/5 p-12 text-center">
          <Wallet className="h-12 w-12 text-muted-foreground/50" />
          <div className="space-y-1">
            <h3 className="font-medium text-sm">
              {wallets_t.empty}
            </h3>
          </div>
        </div>
      </div>

      <WalletForm
        open={isWalletOpen}
        onClose={() => {
          setIsWalletOpen(false);
          setEditingWallet(null);
        }}
        wallet={editingWallet}
        dictionary={dictionary}
      />

      <WalletGroupForm
        open={isGroupOpen}
        onClose={() => {
          setIsGroupOpen(false);
          setEditingGroup(null);
        }}
        group={editingGroup}
        dictionary={dictionary}
      />
    </div>
  );
}
