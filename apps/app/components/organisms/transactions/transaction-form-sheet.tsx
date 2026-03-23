"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  createTransaction,
  updateTransaction,
} from "@workspace/modules/transaction/transaction.action";
import { uploadVaultFile } from "@workspace/modules/vault/vault.action";
import type { Transaction } from "@workspace/types";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CurrencyInput,
  cn,
  Editor,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  InputDate,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui";
import { SelectAccount } from "@/components/molecules/select-account";
import { SelectCategory } from "@/components/molecules/select-category";
import { SelectUser } from "@/components/molecules/select-user";
import { useAppStore } from "@/stores/app";
import {
  Check,
  ChevronsUpDown,
  File,
  FileText,
  Film,
  Image,
  Paperclip,
  X,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { VaultPickerModal } from "@/components/molecules/vault-picker-modal";

const getTransactionSchema = (dictionary: any) =>
  z.object({
    amount: z.coerce
      .number()
      .positive(dictionary?.transactions?.errors?.amount_positive || "Amount must be positive"),
    date: z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
      message: dictionary?.transactions?.errors?.invalid_date || "Invalid date",
    }),
    type: z.enum([
      "income",
      "expense",
      "transfer",
      "transfer-in",
      "transfer-out",
    ]),
    walletId: z.string().min(1, dictionary?.transactions?.errors?.wallet_required || "Account is required"),
    toWalletId: z.string().optional(),
    categoryId: z.string().optional(),
    name: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    assignedUserId: z.string().optional(),
    attachmentIds: z.array(z.string()).optional(),
  });

type TransactionFormValues = z.infer<ReturnType<typeof getTransactionSchema>>;

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
  onSuccess?: () => void;
}

export function TransactionFormSheet({
  open,
  onOpenChange,
  transaction,
  onSuccess,
}: Props) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TransactionFormValues["type"]>(
    (transaction?.type as TransactionFormValues["type"]) || "expense",
  );
  const [attachments, setAttachments] = useState<VaultFileRef[]>([]);
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const { settings, user, dictionary } = useAppStore();

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(
      dictionary ? getTransactionSchema(dictionary) : ({} as any),
    ),
    defaultValues: {
      type: "expense",
      date: new Date().toISOString().split("T")[0],
      amount: 0,
      name: "",
      description: "",
      walletId: "",
      categoryId: "",
      toWalletId: "",
      assignedUserId: user?.id ?? "",
      attachmentIds: [],
    },
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        if (transaction) {
          form.reset({
            amount: Number(transaction.amount),
            date:
              typeof transaction.date === "string"
                ? transaction.date.slice(0, 10)
                : new Date(transaction.date).toISOString().slice(0, 10),
            type: transaction.type as "income" | "expense" | "transfer",
            walletId: transaction.walletId ?? "",
            toWalletId: transaction.toWalletId ?? "",
            categoryId: transaction.categoryId ?? "",
            name: transaction.name ?? "",
            description: transaction.description ?? "",
            attachmentIds: transaction.attachmentIds ?? [],
            assignedUserId: transaction.assignedUserId ?? "",
          });
          setAttachments(transaction.attachments ?? []);
          setActiveTab(transaction.type as any);
        } else {
          form.reset({
            type: "expense",
            date: new Date().toISOString().split("T")[0],
            amount: 0,
            name: "",
            description: "",
            walletId: "",
            categoryId: "",
            toWalletId: "",
            attachmentIds: [],
            assignedUserId: user?.id ?? "",
          });
          setAttachments([]);
          setActiveTab("expense");
        }
      } catch (error) {
        console.error("Failed to load transaction data:", error);
      }
    };
    if (open) {
      loadData();
    }
  }, [open, transaction, form, user?.id]);

  async function onSubmit(data: TransactionFormValues) {
    if (!dictionary) return;
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        amount: data.amount.toString(),
        attachmentIds: attachments.map((a) => a.id),
      };

      if (transaction?.id) {
        await updateTransaction(transaction.id, payload);
        toast.success(dictionary.transactions.toasts.updated);
      } else {
        await createTransaction(payload);
        toast.success(dictionary.transactions.toasts.created);
      }

      await queryClient.invalidateQueries({ queryKey: ["transactions"] });

      form.reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast.error(dictionary.transactions.errors.save_failed);
    } finally {
      setIsLoading(false);
    }
  }

  const handleTabChange = (value: string) => {
    const newType = value as "income" | "expense" | "transfer";
    setActiveTab(newType);
    form.setValue("type", newType);
    if (newType === "transfer") {
      form.setValue("categoryId", undefined);
    }
  };

  const handleVaultConfirm = (ids: string[]) => {
    const newAttachments = ids.map((id) => {
      const existing = attachments.find((a) => a.id === id);
      return (
        existing ?? { id, name: id, size: 0, type: "application/octet-stream" }
      );
    });
    setAttachments(newAttachments);
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const ALLOWED_TYPES = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
      ];
      if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error(
          `Invalid file type for ${file.name}. Only documents and images are allowed.`,
        );
      }
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadVaultFile(formData);
      if (result.success) return result.data;
      throw new Error(result.error);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["vault-files"] });
      setAttachments((prev) => {
        if (prev.find((a) => a.id === data.id)) return prev;
        return [
          ...prev,
          { id: data.id, name: data.name, size: data.size, type: data.type },
        ];
      });
    },
    onError: (error: any) => {
      toast.error(error.message || dictionary?.transactions.errors.upload_failed || "Upload failed");
    },
  });

  const handleUploadFiles = async (selectedFiles: FileList | File[]) => {
    if (!dictionary) return;
    const filesArray = Array.from(selectedFiles);
    if (filesArray.length === 0) return;

    const toastId = toast.loading(
      dictionary.transactions.toasts.uploading_files.replace(
        "{count}",
        filesArray.length.toString(),
      ),
    );

    try {
      await Promise.all(
        filesArray.map((file) => uploadMutation.mutateAsync(file)),
      );
      toast.success(dictionary.transactions.toasts.all_uploads_success, {
        id: toastId,
      });
    } catch (error) {
      toast.error(dictionary.transactions.errors.some_uploads_failed, {
        id: toastId,
      });
    }
  };

  if (!dictionary) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col h-full p-0">
        <SheetHeader className="px-6 py-6 border-b shrink-0">
          <SheetTitle>
            {transaction
              ? dictionary.transactions.edit_transaction
              : dictionary.transactions.new_transaction}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar">
          <Form {...form}>
            <form
              id="transaction-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-8"
            >
              <div className="flex w-full border border-border bg-muted/30 overflow-hidden">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!!transaction}
                  className={cn(
                    "flex-1 rounded-none text-xs border-r border-border last:border-r-0 h-full",
                    activeTab === "expense"
                      ? "bg-muted font-medium shadow-sm"
                      : "bg-transparent text-muted-foreground hover:bg-muted/50",
                  )}
                  onClick={() => handleTabChange("expense")}
                >
                  {dictionary.transactions.types.expense}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!!transaction}
                  className={cn(
                    "flex-1 rounded-none text-xs border-r border-border last:border-r-0 h-full",
                    activeTab === "income"
                      ? "bg-muted font-medium shadow-sm"
                      : "bg-transparent text-muted-foreground hover:bg-muted/50",
                  )}
                  onClick={() => handleTabChange("income")}
                >
                  {dictionary.transactions.types.income}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!!transaction}
                  className={cn(
                    "flex-1 rounded-none text-xs h-full",
                    activeTab === "transfer"
                      ? "bg-muted font-medium shadow-sm"
                      : "bg-transparent text-muted-foreground hover:bg-muted/50",
                  )}
                  onClick={() => handleTabChange("transfer")}
                >
                  {dictionary.transactions.types.transfer}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-[-24px] mb-4">
                {dictionary.transactions.hints.type}
              </p>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      {dictionary.transactions.description_label}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={dictionary.transactions.placeholders.description}
                        {...field}
                        value={field.value ?? ""}
                        className="bg-transparent h-10 transition-colors focus:border-foreground"
                      />
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      {dictionary.transactions.hints.description}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        {dictionary.transactions.amount_label}
                      </FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/50 transition-colors group-focus-within:text-foreground">
                            {settings?.mainCurrencySymbol ?? "$"}
                          </span>
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
                            currencySymbol={settings?.mainCurrencySymbol}
                            decimalPlaces={settings?.mainCurrencyDecimalPlaces}
                            className={cn(
                              "pl-8 text-sm bg-transparent h-10 transition-colors focus:border-foreground font-medium",
                              activeTab === "expense"
                                ? "text-red-500"
                                : activeTab === "income"
                                  ? "text-green-500"
                                  : "text-blue-500",
                            )}
                          />
                        </div>
                      </FormControl>
                      <FormDescription className="text-[11px]">
                        {dictionary.transactions.hints.amount}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-col">
                  <FormLabel className="text-sm font-medium mb-1 pr-4 pt-1">
                    {dictionary.transactions.currency_label}
                  </FormLabel>
                  <Button
                    variant="outline"
                    className="w-full justify-between pl-3 text-left font-normal bg-transparent h-10 hover:bg-muted/10 text-muted-foreground"
                    disabled
                  >
                    {settings?.mainCurrencyCode || "USD"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                  <FormDescription className="text-[11px] mt-2">
                    {dictionary.transactions.hints.currency}
                  </FormDescription>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="walletId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="text-sm font-medium">
                        {dictionary.transactions.account}
                      </FormLabel>
                      <FormControl>
                        <SelectAccount
                          value={field.value ?? undefined}
                          onChange={(id) => form.setValue("walletId", id)}
                          className="w-full justify-start px-3 text-left font-normal bg-transparent h-10 transition-colors hover:bg-muted/10 hover:bg-transparent"
                        />
                      </FormControl>
                      <FormDescription className="text-[11px]">
                        {dictionary.transactions.hints.account}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="">
                      <FormLabel className="text-sm font-medium">
                        {dictionary.transactions.date_label}
                      </FormLabel>
                      <FormControl>
                        <InputDate
                          value={field.value}
                          onChange={field.onChange}
                          className="bg-transparent h-10 transition-colors focus:border-foreground"
                        />
                      </FormControl>
                      <FormDescription className="text-[11px]">
                        {dictionary.transactions.hints.date}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {activeTab !== "transfer" ? (
                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="text-sm font-medium">
                          {dictionary.transactions.category}
                        </FormLabel>
                        <FormControl>
                          <SelectCategory
                            value={field.value ?? undefined}
                            type={activeTab === "income" ? "income" : "expense"}
                            onChange={(id) => form.setValue("categoryId", id)}
                          />
                        </FormControl>
                        <FormDescription className="text-[11px]">
                          {dictionary.transactions.hints.category}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="toWalletId"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="text-sm font-medium">
                          {dictionary.transactions.to_account}
                        </FormLabel>
                        <FormControl>
                          <SelectAccount
                            value={field.value ?? undefined}
                            onChange={(id) => form.setValue("toWalletId", id)}
                            placeholder={dictionary.transactions.placeholders.destination}
                          />
                        </FormControl>
                        <FormDescription className="text-[11px]">
                          {dictionary.transactions.hints.to_account}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="assignedUserId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="text-sm font-medium">
                        {dictionary.transactions.assign}
                      </FormLabel>
                      <FormControl>
                        <SelectUser
                          value={field.value ?? undefined}
                          onChange={(id) => form.setValue("assignedUserId", id)}
                          placeholder={dictionary.transactions.placeholders.member}
                        />
                      </FormControl>
                      <FormDescription className="text-[11px]">
                        {dictionary.transactions.hints.assign}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-sm font-medium">
                      {dictionary.transactions.notes_label}
                    </FormLabel>
                    <FormControl>
                      <div className="min-h-[120px] border bg-transparent px-3 py-2 text-sm transition-colors focus-within:border-foreground focus-within:ring-0 mb-4">
                        <Editor
                          initialContent={field.value || ""}
                          placeholder={dictionary.transactions.placeholders.notes}
                          onUpdate={(editor) => field.onChange(editor.getHTML())}
                          onBlur={field.onBlur}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      {dictionary.transactions.hints.notes}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3 mb-10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {dictionary.transactions.attachments}
                  </span>
                </div>

                {attachments.length > 0 && (
                  <div className="grid grid-cols-1 gap-2">
                    {attachments.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-muted/20 bg-muted/5 text-sm group transition-colors hover:bg-muted/10"
                      >
                        <FileIcon type={file.type} />
                        <span className="flex-1 truncate">{file.name}</span>
                        {file.size > 0 && (
                          <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline-block">
                            {formatBytes(file.size)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(file.id)}
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
                  className="mt-2 aspect-3/1 sm:aspect-[4/1] border-2 border-dashed flex flex-col items-center justify-center gap-3 bg-muted/5 group hover:bg-muted/10 hover:border-border/60 transition-all cursor-pointer relative overflow-hidden"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("bg-muted/20", "border-primary/50");
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("bg-muted/20", "border-primary/50");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("bg-muted/20", "border-primary/50");
                    if (e.dataTransfer.files) handleUploadFiles(e.dataTransfer.files);
                  }}
                  onClick={() => setVaultPickerOpen(true)}
                >
                  <div className="bg-background p-2 rounded-full shadow-sm border border-border/20 group-hover:scale-110 transition-transform">
                    <Paperclip className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center px-4 sm:px-8 leading-relaxed">
                    <span className="font-medium text-foreground">
                      {dictionary.transactions.click_to_browse}
                    </span>{" "}
                    {dictionary.transactions.drag_drop}
                    <br />
                    <span className="opacity-60 text-[10px]">
                      {dictionary.transactions.upload_hint}
                    </span>
                  </p>

                  {uploadMutation.isPending && (
                    <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center">
                      <span className="text-xs font-medium animate-pulse">
                        {dictionary.transactions.saving}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </form>

            <VaultPickerModal
              open={vaultPickerOpen}
              onOpenChange={setVaultPickerOpen}
              selectedIds={attachments.map((a) => a.id)}
              onConfirm={handleVaultConfirm}
            />
          </Form>
        </div>

        <div className="p-6 border-t bg-background shrink-0 mt-auto">
          <Button
            form="transaction-form"
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading
              ? dictionary.transactions.saving
              : dictionary.transactions.save_transaction}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
