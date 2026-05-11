"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTransactionDebts, updateTransaction } from "@workspace/modules/transaction/transaction.action";
import { deleteTransactionItem, getTransactionItems } from "@workspace/modules/transaction/transaction-items.action";
import { getVaultDownloadUrl } from "@workspace/modules/vault/vault.action";
import type { ActionResponse, Transaction, TransactionItem } from "@workspace/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  cn,
  Label,
  Sheet,
  SheetContent,
} from "@workspace/ui";
import { format, isValid } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  File,
  FileText,
  Film,
  Image as ImageIcon,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { SelectAccount } from "@/components/molecules/select-account";
import { SelectCategory } from "@/components/molecules/select-category";
import { SelectUser } from "@/components/molecules/select-user";
import { VaultPickerModal } from "@/components/molecules/vault-picker-modal";
import { FilePreviewSheet } from "@/components/organisms/file-preview-sheet";
import type { AppDictionary } from "@/modules/types/dictionary";
import { useAppStore } from "@/stores/app";

interface FilePreview {
  id: string;
  name: string;
  type: string;
  url: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (type.startsWith("video/")) return <Film className="h-4 w-4" />;
  if (type === "application/pdf") return <FileText className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
}

function AttachmentCard({
  file,
  onPreview,
  onRemove,
  canRemove = true,
}: {
  file: { id: string; name: string; type: string; size: number };
  onPreview: (file: any) => void;
  onRemove: (id: string) => void;
  canRemove?: boolean;
}) {
  const isImage = file.type.startsWith("image/");

  const { data: urlData } = useQuery({
    queryKey: ["vault-download-url", file.id],
    queryFn: () => getVaultDownloadUrl(file.id),
    enabled: isImage,
    staleTime: 1000 * 60 * 15, // 15 minutes
  });

  const url = urlData?.success ? urlData.data.url : null;

  return (
    <div
      className="group relative cursor-pointer overflow-hidden border bg-muted/10 transition-colors hover:bg-muted/20"
      style={{ aspectRatio: "1 / 1" }}
      onClick={() => onPreview(file)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPreview(file);
        }
      }}
      role="option"
      tabIndex={0}
    >
      {/* Thumbnail or icon */}
      {isImage ? (
        url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={file.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/20">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
          <FileIcon type={file.type} />
          <span className="line-clamp-2 text-center text-[9px] leading-tight">
            {file.name}
          </span>
        </div>
      )}

      {/* Hover overlay with name + size */}
      <div className="absolute inset-0 flex flex-col items-start justify-end bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <p className="line-clamp-1 w-full text-[9px] font-medium text-white leading-tight">
          {file.name}
        </p>
        {file.size > 0 && (
          <p className="text-[8px] text-white/70">{formatBytes(file.size)}</p>
        )}
      </div>

      {/* Remove button */}
      {canRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(file.id);
          }}
          className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      ) : null}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction;
  canEdit?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
  dictionary: AppDictionary;
}

export function TransactionDetailSheet({
  open,
  onOpenChange,
  transaction,
  canEdit = true,
  onNext,
  onPrevious,
  dictionary,
}: Props) {
  const { getTransactionColor, formatCurrency } = useAppStore();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FilePreview | null>(null);
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const queryClient = useQueryClient();
  const transactionId = transaction?.id;

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Transaction>) => {
      if (!transactionId) throw new Error("Transaction ID is required");
      return updateTransaction(transactionId, data);
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(dictionary.transactions.toasts.updated || "Updated");
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      } else {
        toast.error(res.error || dictionary.transactions.errors.save_failed || "Error");
      }
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : null;
      toast.error(errorMessage || dictionary.common.error || "Error");
    },
  });

  const { data: debtsResponse, isLoading: isDebtsLoading } = useQuery({
    queryKey: ["transaction-debts", transactionId],
    queryFn: () => {
      if (!transactionId) throw new Error("Transaction ID is required");
      return getTransactionDebts(transactionId);
    },
    enabled: !!transactionId && open,
  });
  const relatedDebts = debtsResponse?.data || [];

  const { data: itemsResponse, isLoading: isItemsLoading } = useQuery({
    queryKey: ["transaction-items", transactionId],
    queryFn: () => {
      if (!transactionId) throw new Error("Transaction ID is required");
      return getTransactionItems(transactionId);
    },
    enabled: !!transactionId && open,
  });
  const transactionItems: TransactionItem[] = itemsResponse?.data || [];

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => {
      if (!transactionId) throw new Error("Transaction ID is required");
      return deleteTransactionItem(transactionId, itemId);
    },
    onSuccess: (res: ActionResponse<void>) => {
      if (res.success) {
        toast.success(dictionary.transactions.items.item_deleted || "Deleted");
        queryClient.invalidateQueries({
          queryKey: ["transaction-items", transactionId],
        });
      } else {
        toast.error(res.error || dictionary.transactions.items.delete_failed || "Error");
      }
    },
  });

  if (!transaction) return null;

  const handleUpdate = (data: Partial<Transaction>) => {
    if (!canEdit) return;
    updateMutation.mutate(data);
  };

  const handlePreview = async (file: { id: string; name: string; type: string }) => {
    const res = await getVaultDownloadUrl(file.id);
    if (res.success && res.data) {
      setPreviewFile({
        id: file.id,
        name: file.name,
        type: file.type,
        url: res.data.url,
      });
      setPreviewOpen(true);
    } else {
      toast.error(dictionary.transactions.errors.preview_failed || "Error");
    }
  };

  const removeAttachment = (fileId: string) => {
    if (!transaction) return;
    const newAttachmentIds = (transaction?.attachmentIds || []).filter((id) => id !== fileId);
    handleUpdate({ attachmentIds: newAttachmentIds });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col p-0">
        <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto p-6 pb-32">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <span className="select-text text-[#606060] text-xs">
                {transaction?.date
                  ? isValid(new Date(transaction?.date))
                    ? format(new Date(transaction?.date), "MMM d, yyyy")
                    : dictionary.common.na
                  : dictionary.common.na}
              </span>
            </div>

            <h2 className="mt-6 mb-3">{transaction?.name || dictionary.transactions.no_description}</h2>

            {/* Type & Title & Amount */}
            <div className="flex items-center justify-between">
              <div className="flex w-full flex-col space-y-1">
                <h1 className={cn("select-text font-serif text-4xl", getTransactionColor(transaction?.type))}>
                  {formatCurrency(Number(transaction?.amount))}
                </h1>
              </div>
            </div>
          </div>

          {/* Interactive Selection Grid */}
          <div className={cn("grid gap-4 pt-2", transaction?.type === "transfer" ? "grid-cols-1" : "grid-cols-2")}>
            {transaction?.type !== "transfer" && (
              <div className="flex flex-col gap-2">
                <Label className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                  {dictionary.transactions.category}
                </Label>
                <SelectCategory
                  value={transaction?.categoryId || undefined}
                  type={transaction?.type === "income" || transaction?.type === "transfer-in" ? "income" : "expense"}
                  onChange={(id) => handleUpdate({ categoryId: id })}
                  disabled={!canEdit}
                  className="w-full font-medium text-sm"
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                {dictionary.transactions.assign}
              </Label>
              <SelectUser
                value={transaction?.assignedUserId || undefined}
                onChange={(id: string) => handleUpdate({ assignedUserId: id })}
                disabled={!canEdit}
                className="w-full font-medium text-sm"
              />
            </div>
          </div>

          {/* Account Selection */}
          <div className={cn("mt-6 grid gap-4", transaction?.type === "transfer" ? "grid-cols-2" : "grid-cols-1")}>
            <div className="flex flex-col gap-2">
              <Label className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                {dictionary.transactions.account}
              </Label>
              <SelectAccount
                value={transaction?.walletId}
                onChange={(id) => handleUpdate({ walletId: id })}
                disabled={!canEdit}
                className="w-full font-medium text-sm"
              />
            </div>

            {transaction?.type === "transfer" && (
              <div className="flex flex-col gap-2">
                <Label className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                  {dictionary.transactions.to_account}
                </Label>
                <SelectAccount
                  value={transaction?.toWalletId || undefined}
                  onChange={(id) => handleUpdate({ toWalletId: id })}
                  disabled={!canEdit}
                  className="w-full font-medium text-sm"
                  placeholder={dictionary.transactions.select_destination}
                />
              </div>
            )}
          </div>

          {/* Accordion Sections */}
          <Accordion type="multiple" defaultValue={["attachments", "general"]} className="mt-6 w-full">
            <AccordionItem value="attachments" className="border-none">
              <AccordionTrigger className="">{dictionary.transactions.attachments}</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4 pt-1">
                {/* Add from Vault Button */}

                <VaultPickerModal
                  open={vaultPickerOpen}
                  onOpenChange={setVaultPickerOpen}
                  selectedIds={transaction?.attachmentIds || []}
                  onConfirm={(ids) => {
                    handleUpdate({ attachmentIds: ids });
                  }}
                />

                {transaction?.attachments && transaction?.attachments?.length > 0 && (
                  <div className="mb-4 grid grid-cols-3 gap-2">
                    {transaction?.attachments?.map((file) => (
                      <AttachmentCard
                        key={file.id}
                        file={file}
                        onPreview={handlePreview}
                        onRemove={removeAttachment}
                        canRemove={canEdit}
                      />
                    ))}
                  </div>
                )}

                {canEdit ? (
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 flex-1 gap-2 border-muted/20 bg-muted/5 font-medium text-[10px] uppercase tracking-widest"
                      onClick={() => setVaultPickerOpen(true)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {dictionary.transactions.add_or_upload}
                    </Button>
                  </div>
                ) : null}
              </AccordionContent>
            </AccordionItem>

            {relatedDebts.length > 0 && (
              <AccordionItem value="debts" className="border-none">
                <AccordionTrigger className="py-4 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.2em] hover:no-underline">
                  {dictionary.transactions.related_debts}
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-1">
                  {isDebtsLoading ? (
                    <div className="animate-pulse text-muted-foreground text-xs">
                      {dictionary.transactions.loading_debts}
                    </div>
                  ) : (
                    <div className="mb-2 grid grid-cols-1 gap-2">
                      {relatedDebts.map((item) => (
                        <div
                          key={item.payment.id}
                          className="flex flex-col gap-1 rounded-md border border-muted/20 bg-muted/5 px-3 py-2.5 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="max-w-[200px] truncate font-medium">
                              {item.contact.name || dictionary.transactions.unknown}
                            </span>
                            <span
                              className={cn(
                                "font-serif tracking-tight",
                                getTransactionColor(item.debt.type === "payable" ? "expense" : "income"),
                              )}
                            >
                              {formatCurrency(Number(item.payment.amount))}
                            </span>
                          </div>
                          {item.debt.description && (
                            <span className="line-clamp-1 text-[11px] text-muted-foreground">
                              {item.debt.description}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}

            {transactionItems.length > 0 && (
              <AccordionItem value="items" className="border-none">
                <AccordionTrigger className="py-4 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.2em] hover:no-underline">
                  <span className="flex items-center gap-2">
                    <ShoppingBag className="h-3.5 w-3.5" />
                    {dictionary.transactions.items.section_title}
                    <Badge variant="secondary" className="h-4 px-1.5 py-0 font-mono text-[10px]">
                      {transactionItems.length}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pt-1 pb-2">
                  {isItemsLoading ? (
                    <div className="animate-pulse py-2 text-muted-foreground text-xs">
                      {dictionary.transactions.items.loading}
                    </div>
                  ) : (
                    <div className="mb-2 grid grid-cols-1 gap-2">
                      {transactionItems.map((item) => (
                        <div
                          key={item.id}
                          className="group flex items-start justify-between gap-3 rounded-md border border-muted/20 bg-muted/5 px-3 py-2.5"
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium text-sm">{item.name}</span>
                              {item.brand && (
                                <Badge variant="outline" className="h-4 shrink-0 px-1 py-0 font-normal text-[9px]">
                                  {item.brand}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              {item.category && <span className="max-w-[100px] truncate">{item.category.name}</span>}
                              {item.quantity && (
                                <span className="shrink-0 tabular-nums">
                                  {item.quantity}
                                  {item.unit ? ` ${item.unit}` : ""}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-serif text-sm tabular-nums">
                              {formatCurrency(Number(item.amount))}
                            </span>
                            {canEdit ? (
                              <button
                                type="button"
                                title={dictionary.transactions.items.delete_item}
                                onClick={() => deleteItemMutation.mutate(item.id)}
                                disabled={deleteItemMutation.isPending}
                                className="p-1 opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}

            <AccordionItem value="general" className="border-none">
              <AccordionTrigger>{dictionary.transactions.details}</AccordionTrigger>
              <AccordionContent className="flex flex-col space-y-5 border-t pt-2 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">{dictionary.transactions.type_label}</span>
                  <span className={cn("font-medium text-xs capitalize", getTransactionColor(transaction?.type))}>
                    {transaction?.type}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">{dictionary.transactions.account}</span>
                  <span className="max-w-[150px] truncate font-medium text-xs">
                    {transaction?.wallet?.name || dictionary.transactions.no_account}
                  </span>
                </div>
                {transaction?.type === "transfer" && transaction.toWallet?.name && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">{dictionary.transactions.to_account}</span>
                    <span className="max-w-[150px] truncate font-medium text-xs">{transaction.toWallet?.name}</span>
                  </div>
                )}
                {transaction?.type !== "transfer" && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">{dictionary.transactions.category}</span>
                    <span className="max-w-[150px] truncate font-medium text-xs">
                      {transaction?.category?.name || dictionary.transactions.uncategorized}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">{dictionary.transactions.assign}</span>
                  <span className="max-w-[150px] truncate font-medium text-xs">
                    {transaction?.user?.name || dictionary.transactions.unassigned}
                  </span>
                </div>
              </AccordionContent>
            </AccordionItem>

            {transaction?.description && (
              <AccordionItem value="note" className="border-none">
                <AccordionTrigger className="py-4 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.2em] hover:no-underline">
                  {dictionary.transactions.notes_label}
                </AccordionTrigger>
                <AccordionContent className="pt-1">
                  <div className="wrap-break-word max-w-[90%] text-sm leading-relaxed">{transaction?.description}</div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </div>

        {/* Footer Toolbar */}
        <div className="-translate-x-1/2 absolute bottom-0 left-1/2 z-50 flex w-[calc(100%-3rem)] items-center justify-between border-t bg-background/70 py-2 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <p className="text-[10px] text-muted-foreground/60">
              {dictionary.transactions.created_at}{" "}
              {transaction.createdAt || transaction?.date
                ? isValid(new Date(transaction.createdAt || transaction?.date))
                  ? format(
                      new Date(transaction.createdAt || transaction?.date),
                      `MMM d, yyyy '${dictionary.transactions.at}' h:mm a`,
                    )
                  : dictionary.common.na
                : dictionary.common.na}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                className="h-7 w-7 border p-0"
                variant="ghost"
                size="icon"
                onClick={onPrevious}
                disabled={!onPrevious}
              >
                <ArrowUp className="h-3 w-3 text-foreground/50" />
              </Button>
              <Button className="h-7 w-7 border p-0" variant="ghost" size="icon" onClick={onNext} disabled={!onNext}>
                <ArrowDown className="h-3 w-3 text-foreground/50" />
              </Button>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="group grid h-7 place-items-center border px-3 transition-colors hover:bg-muted/40"
            >
              <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest group-hover:text-foreground">
                {dictionary.transactions.esc}
              </span>
            </button>
          </div>
        </div>

        <FilePreviewSheet open={previewOpen} onOpenChange={setPreviewOpen} file={previewFile} />
      </SheetContent>
    </Sheet>
  );
}
