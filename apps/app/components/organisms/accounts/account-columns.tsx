"use client";

import type { ColumnDef } from "@tanstack/react-table";
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
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteWallet, updateWallet } from "@workspace/modules/client";
import { SelectAccountGroup } from "@/components/molecules/select-account-group";
import { useQueryClient } from "@tanstack/react-query";

const CellActions = ({
  row,
  onEdit,
  dictionary,
}: {
  row: { original: Wallet };
  onEdit: (wallet: Wallet) => void;
  dictionary: any;
}) => {
  const wallet = row.original;
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    if (!confirm(dictionary.accounts.confirmations.delete)) return;

    try {
      const result = await deleteWallet(wallet.id);
      if (result.success) {
        toast.success(dictionary.accounts.toasts.deleted);
        queryClient.invalidateQueries({ queryKey: ["wallets"] });
      } else {
        toast.error(result.error || dictionary.accounts.toasts.delete_failed);
      }
    } catch (error) {
      toast.error(dictionary.settings.common.error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">
            {dictionary.settings.common.open_menu}
          </span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {dictionary.accounts.table.actions}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onEdit(wallet)}>
          <Pencil className="mr-2 h-4 w-4" />
          <span>{dictionary.transactions.edit}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          <span>{dictionary.transactions.delete}</span>
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
  dictionary: any;
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
    } catch (error) {
      toast.error(dictionary.settings.common.error);
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <SelectAccountGroup
        value={wallet.groupId || undefined}
        onChange={handleGroupChange}
        variant="ghost"
        className="h-8 w-full justify-start font-normal"
        placeholder={dictionary.accounts.group_placeholder}
      />
    </div>
  );
};

export const accountColumns = (
  onEdit: (wallet: Wallet) => void,
  updateWalletInCache: (updatedWallet: Wallet) => void,
  dictionary: any,
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
      <span className="truncate font-medium font-sans px-2">
        {getValue<string>() || (dictionary?.settings?.common?.na ?? "N/A")}
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
      <GroupCell
        wallet={row.original}
        updateWalletInCache={updateWalletInCache}
        dictionary={dictionary}
      />
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
      const { formatCurrency } = (table.options.meta as any) || {};

      return (
        <span className="font-sans font-medium text-right block w-full text-sm px-2">
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
      if (!val) return dictionary?.settings?.common?.na ?? "N/A";
      return (
        <span className="font-sans text-muted-foreground px-2">
          {new Date(val).toLocaleDateString(dictionary?.language?.locale || "en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
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
    cell: ({ row }) => (
      <CellActions row={row} onEdit={onEdit} dictionary={dictionary} />
    ),
  },
];
