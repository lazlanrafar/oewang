"use client";

import * as React from "react";

import {
  Button,
  cn,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@workspace/ui";
import { GripVertical, Pencil, Trash2 } from "lucide-react";

import type { Wallet } from "@workspace/types";
import type { WalletGroup } from "@workspace/modules/wallet-group/wallet-group.action";
import { useSettingsStore } from "@/stores/settings-store";

export type { Wallet, WalletGroup };

interface WalletItemProps {
  wallet: Wallet;
  mode?: "view" | "manage";
  onEdit?: (wallet: Wallet) => void;
  onDelete?: (wallet: Wallet) => void;
  dragAttributes?: any;
  dragListeners?: any;
  cellsOnly?: boolean;
}

export function WalletItem({
  wallet,
  mode = "view",
  onEdit,
  onDelete,
  dragAttributes,
  dragListeners,
  cellsOnly = false,
}: WalletItemProps) {
  const { formatCurrency } = useSettingsStore();

  const cells = (
    <>
      <TableCell className={cn("font-medium", mode === "view" && "py-3")}>
        <div className="flex items-center gap-2">
          {mode === "manage" && (
            <Button
              variant="ghost"
              size="icon"
              className="cursor-move h-8 w-8 -ml-2"
              {...dragAttributes}
              {...dragListeners}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
          <span className={cn(mode === "view" && "text-base")}>
            {wallet.name}
          </span>
        </div>
      </TableCell>
      <TableCell className={cn("text-right", mode === "view" && "py-3")}>
        <span
          className={cn(
            "font-medium",
            mode === "view" && "text-base text-muted-foreground",
            wallet.balance < 0 && "text-destructive",
          )}
        >
          {formatCurrency(wallet.balance)}
        </span>
      </TableCell>
      {mode === "manage" && (
        <TableCell className="text-right w-[100px]">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit?.(wallet)}
              className="h-8 w-8"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive/90 h-8 w-8"
              onClick={() => onDelete?.(wallet)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      )}
    </>
  );

  if (cellsOnly) return cells;

  return (
    <TableRow
      className={cn(
        "group transition-colors",
        mode === "view" && "hover:bg-transparent border-none py-2",
      )}
    >
      {cells}
    </TableRow>
  );
}

interface WalletGroupHeaderProps {
  groupName: string;
  count: number;
  mode?: "view" | "manage";
  onEdit?: () => void;
  onDelete?: () => void;
}

export function WalletGroupHeader({
  groupName,
  count,
  mode = "view",
  onEdit,
  onDelete,
}: WalletGroupHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-4",
        mode === "manage" ? "border-b bg-muted/20" : "pt-6 pb-2",
      )}
    >
      <h4
        className={cn(
          "font-medium",
          mode === "manage"
            ? "text-sm text-muted-foreground"
            : "text-lg text-muted-foreground",
        )}
      >
        {groupName}
        {mode === "manage" && (
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full ml-2">
            {count}
          </span>
        )}
      </h4>
      {mode === "manage" && (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onEdit}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
