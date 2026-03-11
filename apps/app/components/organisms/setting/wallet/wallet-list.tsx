"use client";

import * as React from "react";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragStartEvent,
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@workspace/ui";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { deleteWallet, getWallets, reorderWallets } from "@workspace/modules/wallet/wallet.action";
import { deleteWalletGroup, getWalletGroups } from "@workspace/modules/wallet-group/wallet-group.action";
import { type Wallet, type WalletGroup, WalletGroupHeader, WalletItem } from "@/components/molecules/wallet-display";

import { WalletForm } from "./wallet-form";
import { WalletGroupForm } from "./wallet-group-form";

interface WalletListProps {
  dictionary: any;
}

function SortableWalletRow({
  wallet,
  onEdit,
  onDelete,
}: {
  wallet: Wallet;
  onEdit: (wallet: Wallet) => void;
  onDelete: (wallet: Wallet) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
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
    <TableRow ref={setNodeRef} style={style} className="group transition-colors border-b">
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

export function WalletList({ dictionary }: WalletListProps) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const [isWalletDialogOpen, setIsWalletDialogOpen] = React.useState(false);
  const [editingWallet, setEditingWallet] = React.useState<Wallet | null>(null);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = React.useState(false);
  const [editingGroup, setEditingGroup] = React.useState<WalletGroup | null>(null);
  const [deleteAlert, setDeleteAlert] = React.useState<{
    type: "wallet" | "group";
    id: string;
  } | null>(null);

  const { data: serverGroups, isLoading: isLoadingGroups } = useQuery({
    queryKey: ["wallet-groups"],
    queryFn: async () => {
      const result = await getWalletGroups();
      if (result.success) return result.data;
      throw new Error(result.error);
    },
  });

  const { data: serverWallets, isLoading: isLoadingWallets } = useQuery({
    queryKey: ["wallets"],
    queryFn: async () => {
      const result = await getWallets();
      if (result.success) return result.data;
      throw new Error(result.error);
    },
  });

  const [groups, setGroups] = React.useState<WalletGroup[]>([]);
  const [wallets, setWallets] = React.useState<Wallet[]>([]);

  React.useEffect(() => {
    if (serverGroups) setGroups(serverGroups);
  }, [serverGroups]);

  React.useEffect(() => {
    if (serverWallets) setWallets(serverWallets);
  }, [serverWallets]);

  const deleteWalletMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteWallet(id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      toast.success(dictionary.form.delete_success);
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
      toast.success("Group deleted successfully");
      setDeleteAlert(null);
    },
    onError: (error: any) => toast.error(error.message),
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

      // Perform reorder mutation here if needed
      return newItems;
    });
  };

  const walletsByGroup = React.useMemo(() => {
    const map = new Map<string, Wallet[]>();
    groups.forEach((g) => map.set(g.id, []));
    map.set("ungrouped", []);
    wallets.forEach((w) => {
      const gId = w.groupId || "ungrouped";
      if (!map.has(gId)) map.set("ungrouped", []);
      map.get(gId)?.push(w);
    });
    return map;
  }, [wallets, groups]);

  if (isLoadingGroups || isLoadingWallets) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">{dictionary.title}</h3>
          <p className="text-sm text-muted-foreground">{dictionary.description}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingGroup(null);
              setIsGroupDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> {dictionary.add_group_button}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingWallet(null);
              setIsWalletDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> {dictionary.add_button}
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {groups.map((group) => {
          const groupWallets = walletsByGroup.get(group.id) || [];
          if (groupWallets.length === 0) return null;
          return (
            <div key={group.id} className="border rounded-md mb-4 bg-background overflow-hidden">
              <WalletGroupHeader
                groupName={group.name}
                count={groupWallets.length}
                mode="manage"
                onEdit={() => {
                  setEditingGroup(group);
                  setIsGroupDialogOpen(true);
                }}
                onDelete={() => setDeleteAlert({ type: "group", id: group.id })}
              />
              <Table>
                <SortableContext items={groupWallets} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {groupWallets.map((wallet) => (
                      <SortableWalletRow
                        key={wallet.id}
                        wallet={wallet}
                        onEdit={(w) => {
                          setEditingWallet(w);
                          setIsWalletDialogOpen(true);
                        }}
                        onDelete={(w) => setDeleteAlert({ type: "wallet", id: w.id })}
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
            <div className="border rounded-md mb-4 bg-background overflow-hidden">
              <WalletGroupHeader groupName="Ungrouped" count={ungrouped.length} mode="manage" />
              <Table>
                <SortableContext items={ungrouped} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {ungrouped.map((wallet) => (
                      <SortableWalletRow
                        key={wallet.id}
                        wallet={wallet}
                        onEdit={(w) => {
                          setEditingWallet(w);
                          setIsWalletDialogOpen(true);
                        }}
                        onDelete={(w) => setDeleteAlert({ type: "wallet", id: w.id })}
                      />
                    ))}
                  </TableBody>
                </SortableContext>
              </Table>
            </div>
          );
        })()}
      </DndContext>

      <Dialog open={isWalletDialogOpen} onOpenChange={setIsWalletDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingWallet ? "Edit Wallet" : dictionary.add_button}</DialogTitle>
            <DialogDescription>{dictionary.description}</DialogDescription>
          </DialogHeader>
          <WalletForm wallet={editingWallet} onClose={() => setIsWalletDialogOpen(false)} dictionary={dictionary} />
        </DialogContent>
      </Dialog>

      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? dictionary.groups.edit : dictionary.groups.add}</DialogTitle>
          </DialogHeader>
          <WalletGroupForm group={editingGroup} onClose={() => setIsGroupDialogOpen(false)} dictionary={dictionary} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteAlert} onOpenChange={(open) => !open && setDeleteAlert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteAlert?.type === "group" ? dictionary.groups.delete_confirm : dictionary.form.delete_confirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteAlert?.type === "wallet") deleteWalletMutation.mutate(deleteAlert.id);
                else if (deleteAlert?.type === "group") deleteGroupMutation.mutate(deleteAlert.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
