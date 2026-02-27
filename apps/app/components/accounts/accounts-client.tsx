"use client";

import * as React from "react";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableRow,
} from "@workspace/ui";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  deleteWallet,
  getWallets,
  reorderWallets,
} from "@workspace/modules";
import {
  deleteWalletGroup,
  getWalletGroups,
} from "@workspace/modules";
import { WalletForm } from "@/components/setting/wallet/wallet-form";
import { WalletGroupForm } from "@/components/setting/wallet/wallet-group-form";
import {
  type Wallet,
  WalletGroup,
  WalletGroupHeader,
  WalletItem,
} from "@/components/shared/wallet-display";
import { useCurrency } from "@/hooks/use-currency";

function SortableWalletRow({
  wallet,
  onEdit,
  onDelete,
}: {
  wallet: Wallet;
  onEdit: (wallet: Wallet) => void;
  onDelete: (wallet: Wallet) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: wallet.id,
    data: { type: "wallet", wallet },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 0,
    opacity: isDragging ? 0.5 : 1,
  } as React.CSSProperties;

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className="group transition-colors border-b"
    >
      <WalletItem
        wallet={wallet}
        mode="manage"
        cellsOnly={true}
        onEdit={onEdit}
        onDelete={onDelete}
        dragAttributes={attributes}
        dragListeners={listeners}
      />
    </TableRow>
  );
}

interface AccountsClientProps {
  dictionary: any;
  walletsDictionary: any; // Added to reuse WalletForm
}

export function AccountsClient({
  dictionary,
  walletsDictionary,
}: AccountsClientProps) {
  const queryClient = useQueryClient();
  const { formatAmount } = useCurrency();

  // Dialog States
  const [isWalletDialogOpen, setIsWalletDialogOpen] = React.useState(false);
  const [editingWallet, setEditingWallet] = React.useState<Wallet | null>(null);

  const [isGroupDialogOpen, setIsGroupDialogOpen] = React.useState(false);
  const [editingGroup, setEditingGroup] = React.useState<WalletGroup | null>(
    null,
  );

  const [deleteAlert, setDeleteAlert] = React.useState<{
    type: "wallet" | "group";
    id: string;
  } | null>(null);

  const { data: serverWallets, isLoading: isLoadingWallets } = useQuery({
    queryKey: ["wallets"],
    queryFn: async () => {
      const result = await getWallets();
      if (result.success) return result.data;
      throw new Error(result.error);
    },
  });

  const [wallets, setWallets] = React.useState<Wallet[]>([]);

  React.useEffect(() => {
    if (serverWallets) setWallets(serverWallets);
  }, [serverWallets]);

  const { data: groups, isLoading: isLoadingGroups } = useQuery({
    queryKey: ["wallet-groups"],
    queryFn: async () => {
      const result = await getWalletGroups();
      if (result.success) return result.data;
      throw new Error(result.error);
    },
  });

  const deleteWalletMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteWallet(id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      toast.success(walletsDictionary.form.delete_success);
      setDeleteAlert(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteWalletGroup(id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-groups"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      toast.success(walletsDictionary.form.delete_success);
      setDeleteAlert(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const reorderMutation = useMutation({
    mutationFn: async (updates: any) => {
      const result = await reorderWallets(updates);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (error: any) => {
      toast.error(error.message);
      // Revert if needed, but usually local state handles it
      queryClient.refetchQueries({ queryKey: ["wallets"] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setWallets((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      const newItems = arrayMove(items, oldIndex, newIndex);

      // Extract new sort orders
      const updates = newItems.map((item, index) => ({
        id: item.id,
        sortOrder: index,
        groupId: item.groupId,
      }));

      reorderMutation.mutate(updates);
      return newItems;
    });
  };

  const assets = React.useMemo(
    () =>
      wallets
        ?.filter((w) => w.balance > 0)
        .reduce((acc, w) => acc + w.balance, 0) ?? 0,
    [wallets],
  );

  const liabilities = React.useMemo(
    () =>
      wallets
        ?.filter((w) => w.balance < 0)
        .reduce((acc, w) => acc + w.balance, 0) ?? 0,
    [wallets],
  );

  const total = assets + liabilities;

  const walletsByGroup = React.useMemo(() => {
    const map = new Map<string, Wallet[]>();
    groups?.forEach((g) => map.set(g.id, []));
    map.set("ungrouped", []);

    wallets?.forEach((w) => {
      const gId = w.groupId || "ungrouped";
      if (!map.has(gId)) map.set("ungrouped", []);
      map.get(gId)?.push(w);
    });
    return map;
  }, [wallets, groups]);

  const formatCurrency = (amount: number) => {
    return formatAmount(amount);
  };

  if (isLoadingWallets || isLoadingGroups) {
    return (
      <div className="space-y-8 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="w-10" />
        <h1 className="text-xl font-semibold">{dictionary.title}</h1>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setEditingWallet(null);
              setIsWalletDialogOpen(true);
            }}
          >
            <Plus className="size-6" />
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 text-center px-4 py-6 border-b border-t bg-muted/5">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            {dictionary.assets}
          </p>
          <p className="text-base font-bold text-blue-500">
            {formatCurrency(assets)}
          </p>
        </div>
        <div className="space-y-1 border-x">
          <p className="text-sm font-medium text-muted-foreground">
            {dictionary.liabilities}
          </p>
          <p className="text-base font-bold text-red-500">
            {formatCurrency(liabilities)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            {dictionary.total}
          </p>
          <p className="text-base font-bold">{formatCurrency(total)}</p>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-auto">
          {groups?.map((group) => {
            const groupWallets = walletsByGroup.get(group.id) || [];
            if (groupWallets.length === 0) return null;

            return (
              <div key={group.id} className="last:pb-20">
                <WalletGroupHeader
                  groupName={group.name}
                  count={groupWallets.length}
                  mode="manage"
                  onEdit={() => {
                    setEditingGroup(group);
                    setIsGroupDialogOpen(true);
                  }}
                  onDelete={() =>
                    setDeleteAlert({ type: "group", id: group.id })
                  }
                />
                <Table>
                  <SortableContext
                    items={groupWallets}
                    strategy={verticalListSortingStrategy}
                  >
                    <TableBody>
                      {groupWallets.map((wallet) => (
                        <SortableWalletRow
                          key={wallet.id}
                          wallet={wallet}
                          onEdit={(w) => {
                            setEditingWallet(w);
                            setIsWalletDialogOpen(true);
                          }}
                          onDelete={(w) =>
                            setDeleteAlert({ type: "wallet", id: w.id })
                          }
                        />
                      ))}
                    </TableBody>
                  </SortableContext>
                </Table>
              </div>
            );
          })}

          {(() => {
            const ungrouped = walletsByGroup.get("ungrouped") || [];
            if (ungrouped.length === 0) return null;
            return (
              <div className="last:pb-20">
                <WalletGroupHeader
                  groupName="Ungrouped"
                  count={ungrouped.length}
                  mode="manage"
                />
                <Table>
                  <SortableContext
                    items={ungrouped}
                    strategy={verticalListSortingStrategy}
                  >
                    <TableBody>
                      {ungrouped.map((wallet) => (
                        <SortableWalletRow
                          key={wallet.id}
                          wallet={wallet}
                          onEdit={(w) => {
                            setEditingWallet(w);
                            setIsWalletDialogOpen(true);
                          }}
                          onDelete={(w) =>
                            setDeleteAlert({ type: "wallet", id: w.id })
                          }
                        />
                      ))}
                    </TableBody>
                  </SortableContext>
                </Table>
              </div>
            );
          })()}

          {(!wallets || wallets.length === 0) && (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <p className="text-muted-foreground">{dictionary.empty}</p>
            </div>
          )}
        </div>
      </DndContext>

      <Dialog open={isWalletDialogOpen} onOpenChange={setIsWalletDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingWallet ? "Edit Wallet" : walletsDictionary.add_button}
            </DialogTitle>
            <DialogDescription>
              {walletsDictionary.description}
            </DialogDescription>
          </DialogHeader>
          <WalletForm
            wallet={editingWallet}
            onClose={() => setIsWalletDialogOpen(false)}
            dictionary={walletsDictionary}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingGroup
                ? walletsDictionary.groups.form.title_edit
                : walletsDictionary.groups.form.title_new}
            </DialogTitle>
            <DialogDescription>
              {walletsDictionary.groups.description}
            </DialogDescription>
          </DialogHeader>
          <WalletGroupForm
            group={editingGroup}
            onClose={() => setIsGroupDialogOpen(false)}
            dictionary={walletsDictionary}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteAlert}
        onOpenChange={(open) => !open && setDeleteAlert(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {walletsDictionary.form.delete_confirm}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {walletsDictionary.form.delete_description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {walletsDictionary.form.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteAlert?.type === "wallet")
                  deleteWalletMutation.mutate(deleteAlert.id);
                if (deleteAlert?.type === "group")
                  deleteGroupMutation.mutate(deleteAlert.id);
              }}
            >
              {walletsDictionary.form.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
