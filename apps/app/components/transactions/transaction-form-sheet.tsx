"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  createTransaction,
  updateTransaction,
} from "@workspace/modules/transaction/transaction.action";
import type { Transaction } from "@workspace/types";
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
import { SelectAccount } from "@/components/forms/select-account";
import { SelectCategory } from "@/components/forms/select-category";
import { SelectUser } from "@/components/forms/select-user";
import { useCurrency } from "@workspace/ui/hooks";
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

import { VaultPickerModal } from "../shared/vault-picker-modal";

const transactionSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  date: z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
    message: "Invalid date",
  }),
  type: z.enum([
    "income",
    "expense",
    "transfer",
    "transfer-in",
    "transfer-out",
  ]),
  walletId: z.string().min(1, "Wallet is required"),
  toWalletId: z.string().optional(),
  categoryId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  assignedUserId: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

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
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TransactionFormValues["type"]>(
    (transaction?.type as TransactionFormValues["type"]) || "expense",
  );
  const [attachments, setAttachments] = useState<VaultFileRef[]>([]);
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const { settings } = useCurrency();

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema as any),
    defaultValues: {
      type: "expense",
      date: new Date().toISOString().split("T")[0],
      amount: 0,
      name: "",
      description: "",
      walletId: "",
      categoryId: "",
      toWalletId: "",
      assignedUserId: "",
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
            attachmentIds: (transaction as any).attachmentIds ?? [],
            assignedUserId: transaction.assignedUserId ?? "",
          });
          setAttachments((transaction as any).attachments ?? []);
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
            assignedUserId: "",
          });
          setAttachments([]);
          setActiveTab("expense");
        }
      } catch (error) {
        console.error("Failed to load form data", error);
      }
    };
    if (open) {
      loadData();
    }
  }, [open, transaction, form]);

  async function onSubmit(data: TransactionFormValues) {
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        amount: data.amount.toString(),
        attachmentIds: attachments.map((a) => a.id),
      };

      if (transaction?.id) {
        await updateTransaction(transaction.id, payload);
        toast.success("Transaction updated");
      } else {
        await createTransaction(payload);
        toast.success("Transaction created");
      }
      form.reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save transaction");
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col h-full p-0">
        <SheetHeader className="px-6 py-6 border-b shrink-0">
          <SheetTitle>
            {transaction ? "Edit Transaction" : "New Transaction"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar">
          <Form {...form}>
            <form
              id="transaction-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-8"
            >
              {/* Type Toggle */}
              <div className="flex w-full border border-border bg-muted/30 rounded-md overflow-hidden">
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "flex-1 rounded-none text-xs border-r border-border last:border-r-0 h-full",
                    activeTab === "expense"
                      ? "bg-muted font-medium shadow-sm"
                      : "bg-transparent text-muted-foreground hover:bg-muted/50",
                  )}
                  onClick={() => handleTabChange("expense")}
                >
                  Expense
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "flex-1 rounded-none text-xs border-r border-border last:border-r-0 h-full",
                    activeTab === "income"
                      ? "bg-muted font-medium shadow-sm"
                      : "bg-transparent text-muted-foreground hover:bg-muted/50",
                  )}
                  onClick={() => handleTabChange("income")}
                >
                  Income
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "flex-1 rounded-none text-xs h-full",
                    activeTab === "transfer"
                      ? "bg-muted font-medium shadow-sm"
                      : "bg-transparent text-muted-foreground hover:bg-muted/50",
                  )}
                  onClick={() => handleTabChange("transfer")}
                >
                  Transfer
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-[-24px] mb-4">
                Select whether this is money coming in (Income) or going out
                (Expense)
              </p>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Description
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Grocery shopping, Salary…"
                        {...field}
                        className="bg-transparent h-10 transition-colors focus:border-foreground"
                      />
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      A brief description of what this transaction is for
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Amount + Currency */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Amount
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
                              "pl-8 text-sm bg-transparent h-10 transition-colors focus:border-foreground",
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
                        Enter the transaction amount
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-col">
                  <FormLabel className="text-sm font-medium mb-2 pr-4 pt-1">
                    Currency
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
                    The currency for this transaction
                  </FormDescription>
                </div>
              </div>

              {/* Account + Date */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="walletId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="text-sm font-medium">
                        Account
                      </FormLabel>
                      <FormControl>
                        <SelectAccount
                          value={field.value ?? undefined}
                          onChange={(id) => form.setValue("walletId", id)}
                          className="w-full justify-start px-3 text-left font-normal bg-transparent h-10 transition-colors hover:bg-muted/10 hover:bg-transparent"
                        />
                      </FormControl>
                      <FormDescription className="text-[11px]">
                        The account this transaction belongs to
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-sm font-medium">
                        Date
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          className="bg-transparent h-10 transition-colors focus:border-foreground"
                        />
                      </FormControl>
                      <FormDescription className="text-[11px]">
                        When this transaction occurred
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Category + Assign (Placeholder for team) */}
              <div className="grid grid-cols-2 gap-4">
                {activeTab !== "transfer" ? (
                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="text-sm font-medium">
                          Category
                        </FormLabel>
                        <FormControl>
                          <SelectCategory
                            value={field.value ?? undefined}
                            type={activeTab === "income" ? "income" : "expense"}
                            onChange={(id) => form.setValue("categoryId", id)}
                            className="w-full justify-start px-3 text-left font-normal bg-transparent h-10 transition-colors hover:bg-muted/10 hover:bg-transparent"
                          />
                        </FormControl>
                        <FormDescription className="text-[11px]">
                          Help organize and track your transactions
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
                          To Wallet
                        </FormLabel>
                        <FormControl>
                          <SelectAccount
                            value={field.value ?? undefined}
                            onChange={(id) => form.setValue("toWalletId", id)}
                            placeholder="Select destination"
                            className="w-full justify-start px-3 text-left font-normal bg-transparent h-10 transition-colors hover:bg-muted/10 hover:bg-transparent"
                          />
                        </FormControl>
                        <FormDescription className="text-[11px]">
                          The destination account for this transfer
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
                        Assign
                      </FormLabel>
                      <FormControl>
                        <SelectUser
                          value={field.value ?? undefined}
                          onChange={(id) => form.setValue("assignedUserId", id)}
                          placeholder="Select member"
                          className="w-full justify-start px-3 text-left font-normal bg-transparent h-10 transition-colors hover:bg-muted/10 hover:bg-transparent"
                        />
                      </FormControl>
                      <FormDescription className="text-[11px]">
                        Assign this transaction to a team member
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Description (rich text) */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-sm font-medium">Notes</FormLabel>
                    <FormControl>
                      <div className="min-h-[120px] rounded-md border bg-transparent px-3 py-2 text-sm transition-colors focus-within:border-foreground focus-within:ring-0 mb-4">
                        <Editor
                          initialContent={field.value || ""}
                          placeholder="Add notes, links, or any details…"
                          onUpdate={(editor) =>
                            field.onChange(editor.getHTML())
                          }
                          onBlur={field.onBlur}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      Add any additional details or context about this
                      transaction
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Attachments */}
              <div className="space-y-3 mb-10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Attachments
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setVaultPickerOpen(true)}
                    className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Paperclip className="w-3 h-3 mr-1.5" />
                    Attach from Vault
                  </Button>
                </div>

                {attachments.length > 0 && (
                  <div className="grid grid-cols-1 gap-2">
                    {attachments.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-muted/20 bg-muted/5 text-sm group transition-colors hover"
                      >
                        <FileIcon type={file.type} />
                        <span className="flex-1 truncate">{file.name}</span>
                        {file.size > 0 && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatBytes(file.size)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(file.id)}
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
            {isLoading ? "Saving…" : "Save Transaction"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
