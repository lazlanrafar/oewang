"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import type { Dictionary } from "@workspace/dictionaries";
import { deleteWallet, updateWallet } from "@workspace/modules/client";
import type { Wallet } from "@workspace/types";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { isValid } from "date-fns";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SelectAccountGroup } from "@/components/molecules/select-account-group";
import { useConfirm } from "@/components/providers/confirm-modal-provider";

const CellActions = ({
  row,
  onEdit,
  dictionary,
}: {
  row: { original: Wallet };
  onEdit: (wallet: Wallet) => void;
  dictionary: Dictionary;
}) => {
  const wallet = row.original;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const handleDelete = async () => {
    const ok = await confirm({
      title: dictionary.accounts.confirmations.delete,
      description: "This action cannot be undone.",
      confirmLabel: dictionary.common.delete,
      cancelLabel: dictionary.common.cancel,
      destructive: true,
    });
    if (!ok) return;

    try {
      const result = await deleteWallet(wallet.id);
      if (result.success) {
        toast.success(dictionary.accounts.toasts.deleted);
        queryClient.invalidateQueries({ queryKey: ["wallets"] });
      } else {
        toast.error(result.error || dictionary.accounts.toasts.delete_failed);
      }
    } catch (_error) {
      toast.error(dictionary.common.error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">{dictionary.common.open_menu}</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{dictionary.accounts.table.actions}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onEdit(wallet)}>
          <Pencil className="mr-2 h-4 w-4" />
          <span>{dictionary.transactions.edit}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          <span>{dictionary.common.delete}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const GroupCell = ({
  wallet,
  updateWalletInCache,
  dictionary,
}: {
  wallet: Wallet;
  updateWalletInCache: (updatedWallet: Wallet) => void;
  dictionary: Dictionary;
}) => {
  const handleGroupChange = async (groupId: string) => {
    try {
      const res = await updateWallet(wallet.id, { groupId });
      if (res.success && res.data) {
        updateWalletInCache(res.data);
        toast.success(dictionary.accounts.toasts.group_updated);
      } else {
        toast.error(res.error || dictionary.accounts.toasts.group_update_failed);
      }
    } catch (_error) {
      toast.error(dictionary.common.error);
    }
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: wrapper to stop propagation without invalid HTML nesting
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.key === "Enter" && e.stopPropagation()}
      role="button"
      tabIndex={-1}
    >
      <SelectAccountGroup
        value={wallet.groupId || undefined}
        onChange={handleGroupChange}
        variant="ghost"
        className="h-8 w-full justify-start font-normal"
        placeholder={dictionary.accounts.group_placeholder}
        popoverProps={{
          portal: true,
          align: "start",
          side: "bottom",
          sideOffset: 6,
        }}
      />
    </div>
  );
};

export const accountColumns = (
  onEdit: (wallet: Wallet) => void,
  updateWalletInCache: (updatedWallet: Wallet) => void,
  dictionary: Dictionary,
): ColumnDef<Wallet>[] => [
  {
    accessorKey: "name",
    header: dictionary.accounts.table.name,
    size: 200,
    minSize: 120,
    maxSize: 400,
    enableResizing: true,
    enableHiding: false,
    meta: {
      sticky: true,
      headerLabel: dictionary.accounts.table.name,
      className:
        "w-[200px] min-w-[120px] md:sticky md:left-[var(--stick-left)] bg-background group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f] z-10",
    },
    cell: ({ getValue }) => (
      <span className="truncate px-2 font-medium font-sans">
        {getValue<string>() || (dictionary.common.na ?? "N/A")}
      </span>
    ),
  },
  {
    accessorKey: "groupId",
    header: dictionary.accounts.table.group,
    size: 150,
    minSize: 100,
    maxSize: 300,
    enableResizing: true,
    meta: {
      headerLabel: dictionary.accounts.table.group,
      className: "w-[150px] min-w-[100px]",
    },
    cell: ({ row }) => (
      <GroupCell wallet={row.original} updateWalletInCache={updateWalletInCache} dictionary={dictionary} />
    ),
  },
  {
    accessorKey: "balance",
    header: dictionary.accounts.table.balance,
    size: 150,
    minSize: 100,
    maxSize: 250,
    enableResizing: true,
    meta: {
      headerLabel: dictionary.accounts.table.balance,
      className: "w-[150px] min-w-[100px] text-right",
    },
    cell: ({ getValue, table }) => {
      const balance = getValue<number>();
      const { formatCurrency } = (table.options.meta || {}) as { formatCurrency?: (value: number) => string };

      return (
        <span className="block w-full px-2 text-right font-medium font-sans text-sm">
          {formatCurrency ? formatCurrency(balance) : balance}
        </span>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: dictionary.accounts.table.created_at,
    size: 160,
    minSize: 120,
    maxSize: 220,
    enableResizing: true,
    meta: {
      headerLabel: dictionary.accounts.table.created_at,
      className: "w-[160px] min-w-[120px]",
    },
    cell: ({ getValue }) => {
      const val = getValue<string>();
      if (!val) return dictionary.common.na ?? "N/A";
      const date = new Date(val);
      return (
        <span className="px-2 font-sans text-muted-foreground">
          {isValid(date)
            ? date.toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : (dictionary.common.na ?? "N/A")}
        </span>
      );
    },
  },
  {
    id: "actions",
    size: 90,
    enableHiding: false,
    meta: {
      headerLabel: dictionary.accounts.table.actions,
    },
    cell: ({ row }) => <CellActions row={row} onEdit={onEdit} dictionary={dictionary} />,
  },
];
