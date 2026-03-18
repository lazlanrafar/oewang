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
  Label,
  Switch,
  Textarea,
  InputDate,
  CurrencyInput,
} from "@workspace/ui";
import type { Transaction } from "@workspace/types";
import { format } from "date-fns";
import {
  Landmark,
  ChevronUp,
  ChevronDown,
  Paperclip,
  File,
  FileText,
  Film,
  Image,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { updateTransaction } from "@workspace/modules/transaction/transaction.action";
import { getVaultDownloadUrl } from "@workspace/modules/vault/vault.action";
import { toast } from "sonner";
import { SelectCategory } from "@/components/molecules/select-category";
import { SelectUser } from "@/components/molecules/select-user";
import { SelectAccount } from "@/components/molecules/select-account";
import { useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { useSettingsStore } from "@/stores/settings-store";
import { VaultPickerModal } from "@/components/organisms/vault-picker-modal";
import { FilePreviewSheet } from "@/components/organisms/file-preview-sheet";

interface FilePreview {
  id: string;
  name: string;
  type: string;
  url: string;
}

interface VaultFileRef {
  id: string;
  name: string;
  size: number;
  type: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith("image/")) return <Image className="w-4 h-4" />;
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
  const { settings, getTransactionColor, formatCurrency } = useSettingsStore();
  const [excludeFromReports, setExcludeFromReports] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<VaultFileRef[]>([]);
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FilePreview | null>(null);

  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [amount, setAmount] = useState(0);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [date, setDate] = useState("");

  const debouncedName = useDebounce(name, 500);
  const debouncedDescription = useDebounce(description, 500);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (transaction) {
      setExcludeFromReports(transaction.isExported);
      setName(transaction.name || "");
      setDescription(transaction.description || "");
      setAttachments(transaction.attachments || []);
      setAmount(Number(transaction.amount));
      setDate(
        typeof transaction.date === "string"
          ? transaction.date.slice(0, 10)
          : new Date(transaction.date).toISOString().slice(0, 10),
      );
    }
  }, [transaction?.id]); // Only re-run when ID changes, not when props update from list

  const updateTransactionInCache = (updatedData: Partial<Transaction>) => {
    if (!transaction?.id) return;
    queryClient.setQueriesData({ queryKey: ["transactions"] }, (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          data: page.data.map((t: any) =>
            t.id === transaction.id ? { ...t, ...updatedData } : t,
          ),
        })),
      };
    });
  };

  // Real-time update for Name and Description
  useEffect(() => {
    if (!transaction) return;

    const hasChanged =
      (debouncedName !== transaction.name && debouncedName !== "") ||
      (debouncedDescription !== transaction.description &&
        debouncedDescription !== "");

    if (!hasChanged) return;

    const update = async () => {
      if (!transaction?.id) return;
      const res = await updateTransaction(transaction.id, {
        name: debouncedName,
        description: debouncedDescription,
      });
      if (res.success) {
        updateTransactionInCache({
          name: debouncedName,
          description: debouncedDescription,
        });
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      }
    };

    update();
  }, [debouncedName, debouncedDescription, transaction?.id, queryClient]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open || !transaction) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "m") {
        e.preventDefault();
        if (!transaction?.id) return;
        (async () => {
          const res = await updateTransaction(transaction.id, {
            isReady: !transaction.isReady,
          });
          if (res.success) {
            updateTransactionInCache({ isReady: !transaction.isReady });
            await queryClient.invalidateQueries({ queryKey: ["transactions"] });
            toast.success(
              transaction.isReady ? "Marked as pending" : "Marked as ready",
            );
          }
        })();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, transaction, queryClient]);

  const handleVaultConfirm = async (ids: string[]) => {
    if (!transaction) return;

    // In a real scenario, the VaultPicker already uploaded the files.
    // We just need to link them to the transaction.
    // However, we need the basic file info to show them in the UI immediately.
    // For now, let's assume we update the transaction with the new IDs.
    const res = await updateTransaction(transaction.id, {
      attachmentIds: ids,
    });

    if (res.success && res.data) {
      setAttachments(res.data.attachments || []);
      updateTransactionInCache({
        attachmentIds: ids,
        attachments: res.data.attachments,
      });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Attachments updated");
    }
  };

  const removeAttachment = async (id: string) => {
    if (!transaction) return;

    const newIds = attachments.filter((a) => a.id !== id).map((a) => a.id);
    const res = await updateTransaction(transaction.id, {
      attachmentIds: newIds,
    });

    if (res.success && res.data) {
      setAttachments(res.data.attachments || []);
      updateTransactionInCache({
        attachmentIds: newIds,
        attachments: res.data.attachments,
      });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Attachment removed");
    }
  };

  const handlePreview = async (file: VaultFileRef) => {
    // We fetch a fresh signed URL to ensure it hasn't expired
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
      toast.error("Failed to load file preview");
    }
  };

  if (!transaction) return null;

  const isExpense = transaction.type === "expense";
  const isIncome = transaction.type === "income";
  const isTransfer = transaction.type === "transfer";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col h-full p-0">
        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8 pb-32">
          {/* Header Bar */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
              {/* <Landmark className="h-3 w-3 text-muted-foreground/60" /> */}
              <SelectAccount
                value={transaction.walletId ?? undefined}
                onChange={async (walletId) => {
                  const res = await updateTransaction(transaction.id, {
                    walletId,
                  });
                  if (res.success && res.data) {
                    updateTransactionInCache(res.data);
                    await queryClient.invalidateQueries({
                      queryKey: ["transactions"],
                    });
                    toast.success("Account updated");
                  }
                }}
                className="h-auto p-0 border-none bg-transparent hover:bg-transparent text-[10px] font-medium text-muted-foreground uppercase tracking-widest min-w-0"
              />
            </div>
            {isEditingDate ? (
              <InputDate
                value={date}
                className="h-8 w-40 text-[11px] bg-transparent"
                onChange={async (newDate) => {
                  setDate(newDate);
                  setIsEditingDate(false);
                  const currentDateStr =
                    typeof transaction.date === "string"
                      ? transaction.date.slice(0, 10)
                      : new Date(transaction.date).toISOString().slice(0, 10);

                  if (newDate !== currentDateStr) {
                    const res = await updateTransaction(transaction.id, {
                      date: newDate,
                    });
                    if (res.success && res.data) {
                      updateTransactionInCache(res.data);
                      await queryClient.invalidateQueries({
                        queryKey: ["transactions"],
                      });
                      toast.success("Date updated");
                    }
                  }
                }}
              />
            ) : (
              <span
                className="text-[11px] text-muted-foreground tracking-tight cursor-pointer hover:text-foreground transition-colors"
                onClick={() => setIsEditingDate(true)}
              >
                {format(new Date(transaction.date), "MMM d, yyyy")}
              </span>
            )}
          </div>

          {/* Type & Title & Amount */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-start gap-3 pt-1">
              {isEditingAmount ? (
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-3xl font-serif font-medium",
                      getTransactionColor(transaction.type),
                    )}
                  >
                    {settings?.mainCurrencySymbol}
                  </span>
                  <CurrencyInput
                    value={amount}
                    onChange={(val) => setAmount(val)}
                    currencySymbol={settings?.mainCurrencySymbol}
                    decimalPlaces={settings?.mainCurrencyDecimalPlaces}
                    className={cn(
                      "text-5xl tracking-tighter font-medium font-serif bg-transparent border-none p-0 h-auto focus:ring-0 w-full",
                      getTransactionColor(transaction.type),
                    )}
                    autoFocus
                    onBlur={async () => {
                      setIsEditingAmount(false);
                      if (amount !== Number(transaction.amount)) {
                        const res = await updateTransaction(transaction.id, {
                          amount: amount.toString(),
                        });
                        if (res.success && res.data) {
                          updateTransactionInCache(res.data);
                          await queryClient.invalidateQueries({
                            queryKey: ["transactions"],
                          });
                          toast.success("Amount updated");
                        }
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                </div>
              ) : (
                <h1
                  className={cn(
                    "text-5xl tracking-tighter font-medium font-serif cursor-pointer hover:opacity-80 transition-opacity",
                    getTransactionColor(transaction.type),
                  )}
                  onClick={() => setIsEditingAmount(true)}
                >
                  {formatCurrency(Number(transaction.amount))}
                </h1>
              )}
            </div>
          </div>

          {/* Inline Selection Grid */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest px-1">
                Category
              </Label>
              <SelectCategory
                value={transaction.categoryId || undefined}
                type={isIncome ? "income" : "expense"}
                onChange={async (categoryId) => {
                  const res = await updateTransaction(transaction.id, {
                    categoryId,
                  });
                  if (res.success && res.data) {
                    updateTransactionInCache({
                      categoryId,
                      category: res.data.category,
                    });
                    await queryClient.invalidateQueries({
                      queryKey: ["transactions"],
                    });
                    toast.success("Category updated");
                  }
                }}
                className=""
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest px-1">
                Assign
              </Label>
              <SelectUser
                value={transaction.assignedUserId || undefined}
                onChange={async (assignedUserId) => {
                  const res = await updateTransaction(transaction.id, {
                    assignedUserId,
                  });
                  if (res.success && res.data) {
                    updateTransactionInCache({
                      assignedUserId,
                      user: res.data.user,
                    });
                    await queryClient.invalidateQueries({
                      queryKey: ["transactions"],
                    });
                    toast.success("Assignee updated");
                  }
                }}
                className=""
                placeholder="Assign user"
              />
            </div>
          </div>

          {/* Name Input Row */}
          <div className="space-y-2">
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest px-1">
              Description
            </Label>
            <Textarea
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Transaction name"
            />
          </div>

          <Separator className="bg-border" />

          {/* Accordion Sections */}
          <Accordion
            type="multiple"
            defaultValue={["attachments"]}
            className="w-full"
          >
            <AccordionItem value="attachments" className="border-none">
              <AccordionTrigger className="hover:no-underline py-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
                Attachments
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-1">
                {attachments.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 mb-4">
                    {attachments.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-muted/20 bg-muted/5 text-sm group transition-colors hover:bg-muted/10 cursor-pointer"
                        onClick={() => handlePreview(file)}
                      >
                        <FileIcon type={file.type} />
                        <span className="flex-1 truncate font-medium">
                          {file.name}
                        </span>
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
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  onClick={() => setVaultPickerOpen(true)}
                  className="aspect-3/1 border-2 border-dashed flex flex-col items-center justify-center gap-3 bg-muted/5 group hover:bg-muted/10 hover:border-border/60 transition-all cursor-pointer rounded-lg"
                >
                  <div className="bg-background p-2 rounded-full shadow-sm border border-border/20 group-hover:scale-110 transition-transform">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center px-8 leading-relaxed">
                    Attach files from your Vault
                    <br />
                    <span className="opacity-50 text-[10px]">
                      Images, PDFs, and more
                    </span>
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="general" className="border-none">
              <AccordionTrigger className="hover:no-underline py-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
                General
              </AccordionTrigger>
              <AccordionContent className="space-y-6 pt-2">
                <div className="flex items-center justify-between group">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-foreground/90 group-hover:text-foreground transition-colors cursor-pointer">
                      Exclude from reports
                    </Label>
                    <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[280px]">
                      Hides this transaction from all charts and report
                      calculations.
                    </p>
                  </div>
                  <Switch
                    checked={excludeFromReports}
                    onCheckedChange={async (checked: boolean) => {
                      setExcludeFromReports(checked);
                      const res = await updateTransaction(transaction.id, {
                        isExported: checked,
                      });
                      if (res.success) {
                        updateTransactionInCache({ isExported: checked });
                        await queryClient.invalidateQueries({
                          queryKey: ["transactions"],
                        });
                        toast.success(
                          checked
                            ? "Excluded from reports"
                            : "Included in reports",
                        );
                      }
                    }}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="note" className="border-none">
              <AccordionTrigger className="hover:no-underline py-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
                Note
              </AccordionTrigger>
              <AccordionContent className="pt-1">
                <Textarea
                  placeholder="Add a note or description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Footer Toolbar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] bg-background/70 backdrop-blur-xl border px-4 py-1 flex items-center justify-between z-50 shadow-2xl shadow-black/20">
          <div className="flex items-center gap-4">
            {transaction.type === "transfer" && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  To:
                </span>
                <SelectAccount
                  value={transaction.toWalletId ?? undefined}
                  onChange={async (toWalletId) => {
                    const res = await updateTransaction(transaction.id, {
                      toWalletId,
                    });
                    if (res.success && res.data) {
                      updateTransactionInCache({
                        toWalletId,
                        toWallet: res.data.toWallet,
                      });
                      await queryClient.invalidateQueries({
                        queryKey: ["transactions"],
                      });
                      toast.success("Destination updated");
                    }
                  }}
                  className="h-7 p-0 border-none bg-transparent hover:bg-transparent text-[10px] font-bold uppercase tracking-widest min-w-0"
                  placeholder="Target Account"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                className="border"
                variant="ghost"
                size="icon"
                onClick={onPrevious}
                disabled={!onPrevious}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                className="border"
                variant="ghost"
                size="icon"
                onClick={onNext}
                disabled={!onNext}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="px-3 py-2 hover:bg-muted/40 transition-colors group"
            >
              <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground uppercase tracking-widest">
                Esc
              </span>
            </button>
          </div>
        </div>

        <VaultPickerModal
          open={vaultPickerOpen}
          onOpenChange={setVaultPickerOpen}
          selectedIds={attachments.map((a) => a.id)}
          onConfirm={handleVaultConfirm}
        />

        <FilePreviewSheet
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          file={previewFile}
        />
      </SheetContent>
    </Sheet>
  );
}
