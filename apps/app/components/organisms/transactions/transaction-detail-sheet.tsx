"use client";

import {
  Sheet,
  SheetContent,
  Button,
  cn,
  Separator,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
} from "@workspace/ui";
import type { Transaction } from "@workspace/types";
import { format } from "date-fns";
import {
  Landmark,
  X,
  File,
  FileText,
  Film,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  Plus,
} from "lucide-react";
import { useState } from "react";
import {
  getTransactionDebts,
  updateTransaction,
} from "@workspace/modules/transaction/transaction.action";
import {
  getVaultDownloadUrl,
  uploadVaultFile,
  getVaultFiles,
  type VaultFile,
} from "@workspace/modules/vault/vault.action";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app";
import { FilePreviewSheet } from "@/components/organisms/file-preview-sheet";
import { SelectUser } from "@/components/molecules/select-user";
import { SelectCategory } from "@/components/molecules/select-category";
import { SelectAccount } from "@/components/molecules/select-account";
import { VaultPickerModal } from "@/components/molecules/vault-picker-modal";
import { Label } from "@workspace/ui";

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
  if (type.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
  if (type.startsWith("video/")) return <Film className="w-4 h-4" />;
  if (type === "application/pdf") return <FileText className="w-4 h-4" />;
  return <File className="w-4 h-4" />;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction;
  onNext?: () => void;
  onPrevious?: () => void;
}

export function TransactionDetailSheet({
  open,
  onOpenChange,
  transaction,
  onNext,
  onPrevious,
}: Props) {
  const { getTransactionColor, formatCurrency, dictionary } = useAppStore();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FilePreview | null>(null);
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const queryClient = useQueryClient();

  if (!dictionary) return null;

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Transaction>) =>
      updateTransaction(transaction!.id, data),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(dictionary.transactions.toasts.updated);
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      } else {
        toast.error(res.error || dictionary.transactions.errors.save_failed);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || dictionary.settings.common.error);
    },
  });

  const handleUpdate = (data: Partial<Transaction>) => {
    updateMutation.mutate(data);
  };

  const { data: debtsResponse, isLoading: isDebtsLoading } = useQuery({
    queryKey: ["transaction-debts", transaction?.id],
    queryFn: () => getTransactionDebts(transaction!.id),
    enabled: !!transaction?.id && open,
  });
  const relatedDebts = debtsResponse?.data || [];

  const handlePreview = async (file: any) => {
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
      toast.error(dictionary.transactions.errors.preview_failed);
    }
  };

  const removeAttachment = (fileId: string) => {
    if (!transaction) return;
    const newAttachmentIds = (transaction.attachmentIds || []).filter(
      (id) => id !== fileId,
    );
    handleUpdate({ attachmentIds: newAttachmentIds });
  };

  if (!transaction) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col h-full p-0">
        <div className="flex-1 overflow-y-auto no-scrollbar p-6 flex flex-col pb-32">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <span className="text-[#606060] text-xs select-text">
                {format(new Date(transaction.date), "MMM d, yyyy")}
              </span>
            </div>

            <h2 className="mt-6 mb-3">
              {transaction.name || dictionary.transactions.no_description}
            </h2>

            {/* Type & Title & Amount */}
            <div className="flex justify-between items-center">
              <div className="flex flex-col w-full space-y-1">
                <h1
                  className={cn(
                    "text-4xl select-text font-serif",
                    getTransactionColor(transaction.type),
                  )}
                >
                  {formatCurrency(Number(transaction.amount))}
                </h1>
              </div>
            </div>
          </div>

          {/* Interactive Selection Grid */}
          <div
            className={cn(
              "grid gap-4 pt-2",
              transaction.type === "transfer" ? "grid-cols-1" : "grid-cols-2",
            )}
          >
            {transaction.type !== "transfer" && (
              <div className="flex flex-col gap-2">
                <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                  {dictionary.transactions.category}
                </Label>
                <SelectCategory
                  value={transaction.categoryId || undefined}
                  type={
                    transaction.type === "income" ||
                    transaction.type === "transfer-in"
                      ? "income"
                      : "expense"
                  }
                  onChange={(id) => handleUpdate({ categoryId: id })}
                  className="w-full text-sm font-medium"
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                {dictionary.transactions.assign}
              </Label>
              <SelectUser
                value={transaction.assignedUserId || undefined}
                onChange={(id: string) => handleUpdate({ assignedUserId: id })}
                className="w-full text-sm font-medium"
              />
            </div>
          </div>

          {/* Account Selection */}
          <div
            className={cn(
              "grid gap-4 mt-6",
              transaction.type === "transfer" ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            <div className="flex flex-col gap-2">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                {dictionary.transactions.account}
              </Label>
              <SelectAccount
                value={transaction.walletId}
                onChange={(id) => handleUpdate({ walletId: id })}
                className="w-full text-sm font-medium"
              />
            </div>

            {transaction.type === "transfer" && (
              <div className="flex flex-col gap-2">
                <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                  {dictionary.transactions.to_account}
                </Label>
                <SelectAccount
                  value={transaction.toWalletId || undefined}
                  onChange={(id) => handleUpdate({ toWalletId: id })}
                  className="w-full text-sm font-medium"
                  placeholder={dictionary.transactions.select_destination}
                />
              </div>
            )}
          </div>

          {/* Accordion Sections */}
          <Accordion
            type="multiple"
            defaultValue={["attachments", "general"]}
            className="w-full mt-6"
          >
            <AccordionItem value="attachments" className="border-none">
              <AccordionTrigger className="">
                {dictionary.transactions.attachments}
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4 pt-1">
                {/* Add from Vault Button */}

                <VaultPickerModal
                  open={vaultPickerOpen}
                  onOpenChange={setVaultPickerOpen}
                  selectedIds={transaction.attachmentIds || []}
                  onConfirm={(ids) => {
                    handleUpdate({ attachmentIds: ids });
                  }}
                />

                {transaction.attachments &&
                  transaction.attachments.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 mb-4">
                      {transaction.attachments.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center gap-3 px-3 py-2.5 border bg-muted/5 text-sm group transition-colors hover:bg-muted/10 cursor-pointer"
                          onClick={() => handlePreview(file)}
                        >
                          <FileIcon type={file.type} />
                          <span className="flex-1 truncate font-medium">
                            {file.name}
                          </span>
                          <div className="flex items-center gap-2">
                            {file.size > 0 && (
                              <span className="text-xs text-muted-foreground shrink-0 font-sans">
                                {formatBytes(file.size)}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeAttachment(file.id);
                              }}
                              className="p-1 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                <div className="flex items-center justify-between gap-4 mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 text-[10px] font-medium uppercase tracking-widest gap-2 bg-muted/5 border-muted/20"
                    onClick={() => setVaultPickerOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {dictionary.transactions.add_or_upload}
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {relatedDebts.length > 0 && (
              <AccordionItem value="debts" className="border-none">
                <AccordionTrigger className="hover:no-underline py-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
                  {dictionary.transactions.related_debts}
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-1">
                  {isDebtsLoading ? (
                    <div className="text-xs text-muted-foreground animate-pulse">
                      {dictionary.transactions.loading_debts}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 mb-2">
                      {relatedDebts.map((item: any) => (
                        <div
                          key={item.payment?.id}
                          className="flex flex-col gap-1 px-3 py-2.5 rounded-md border border-muted/20 bg-muted/5 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium truncate max-w-[200px]">
                              {item.contact?.name ||
                                dictionary.transactions.unknown}
                            </span>
                            <span
                              className={cn(
                                "font-serif tracking-tight",
                                getTransactionColor(
                                  item.debt?.type === "payable"
                                    ? "expense"
                                    : "income",
                                ),
                              )}
                            >
                              {formatCurrency(Number(item.payment?.amount))}
                            </span>
                          </div>
                          {item.debt?.description && (
                            <span className="text-[11px] text-muted-foreground line-clamp-1">
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

            <AccordionItem value="general" className="border-none">
              <AccordionTrigger>
                {dictionary.transactions.details}
              </AccordionTrigger>
              <AccordionContent className="flex flex-col pt-2 border-t pt-4 space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {dictionary.transactions.type_label}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-medium capitalize",
                      getTransactionColor(transaction.type),
                    )}
                  >
                    {transaction.type}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {dictionary.transactions.account}
                  </span>
                  <span className="text-xs font-medium truncate max-w-[150px]">
                    {transaction.wallet?.name ||
                      dictionary.transactions.no_account}
                  </span>
                </div>
                {transaction.type === "transfer" &&
                  transaction.toWallet?.name && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {dictionary.transactions.to_account}
                      </span>
                      <span className="text-xs font-medium truncate max-w-[150px]">
                        {transaction.toWallet.name}
                      </span>
                    </div>
                  )}
                {transaction.type !== "transfer" && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {dictionary.transactions.category}
                    </span>
                    <span className="text-xs font-medium truncate max-w-[150px]">
                      {transaction.category?.name ||
                        dictionary.transactions.uncategorized}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {dictionary.transactions.assign}
                  </span>
                  <span className="text-xs font-medium truncate max-w-[150px]">
                    {transaction.user?.name ||
                      dictionary.transactions.unassigned}
                  </span>
                </div>
              </AccordionContent>
            </AccordionItem>

            {transaction.description && (
              <AccordionItem value="note" className="border-none">
                <AccordionTrigger className="hover:no-underline py-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
                  {dictionary.transactions.notes_label}
                </AccordionTrigger>
                <AccordionContent className="pt-1">
                  <div className="text-sm leading-relaxed max-w-[90%] wrap-break-word">
                    {transaction.description}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </div>

        {/* Footer Toolbar */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] bg-background/70 backdrop-blur-xl py-2 flex items-center justify-between z-50 shadow-2xl shadow-black/20 border-t">
          <div className="flex items-center gap-4">
            <p className="text-[10px] text-muted-foreground/60">
              {dictionary.transactions.created_at}{" "}
              {format(
                new Date(transaction.createdAt || transaction.date),
                `MMM d, yyyy '${dictionary.transactions.at}' h:mm a`,
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                className="border p-0 w-7 h-7"
                variant="ghost"
                size="icon"
                onClick={onPrevious}
                disabled={!onPrevious}
              >
                <ArrowUp className="h-3 w-3 text-foreground/50" />
              </Button>
              <Button
                className="border p-0 w-7 h-7"
                variant="ghost"
                size="icon"
                onClick={onNext}
                disabled={!onNext}
              >
                <ArrowDown className="h-3 w-3 text-foreground/50" />
              </Button>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="px-3 hover:bg-muted/40 transition-colors group border grid place-items-center h-7"
            >
              <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground uppercase tracking-widest">
                {dictionary.transactions.esc}
              </span>
            </button>
          </div>
        </div>

        <FilePreviewSheet
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          file={previewFile}
        />
      </SheetContent>
    </Sheet>
  );
}
