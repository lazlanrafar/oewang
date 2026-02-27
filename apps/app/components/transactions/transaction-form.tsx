"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Category, Wallet } from "@workspace/types";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Editor,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@workspace/ui";
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

import { getCategories } from "@workspace/modules";
import {
  createTransaction,
  updateTransaction,
} from "@workspace/modules";
import { getWallets } from "@workspace/modules";
import { CurrencyInput } from "@workspace/ui";
import { useCurrency } from "@/hooks/use-currency";

import { VaultPickerModal } from "../shared/vault-picker-modal";

const transactionSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date",
  }),
  type: z.enum(["income", "expense", "transfer"]),
  walletId: z.string().min(1, "Wallet is required"),
  toWalletId: z.string().optional(),
  categoryId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

interface VaultFileRef {
  id: string;
  name: string;
  size: number;
  type: string;
}

interface TransactionFormProps {
  onSuccess?: () => void;
  defaultValues?: Partial<TransactionFormValues>;
  initialAttachments?: VaultFileRef[];
  transactionId?: string;
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

export function TransactionForm({
  onSuccess,
  defaultValues,
  initialAttachments = [],
  transactionId,
}: TransactionFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"income" | "expense" | "transfer">(
    (defaultValues?.type as "income" | "expense" | "transfer") || "expense",
  );
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [attachments, setAttachments] =
    useState<VaultFileRef[]>(initialAttachments);
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const { settings } = useCurrency();

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: "expense",
      date: new Date().toISOString().split("T")[0],
      amount: 0,
      name: "",
      description: "",
      walletId: "",
      categoryId: "",
      toWalletId: "",
      attachmentIds: [],
      ...defaultValues,
    },
  });

  const type = form.watch("type");
  const filteredCategories = categories.filter((c) => c.type === activeTab);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [walletsResponse, categoriesResponse] = await Promise.all([
          getWallets(),
          getCategories(),
        ]);

        if (walletsResponse.success && walletsResponse.data) {
          setWallets(walletsResponse.data);
        }
        if (categoriesResponse.success && categoriesResponse.data) {
          setCategories(categoriesResponse.data);
        }

        // Re-sync on edit so comboboxes display the correct names
        if (defaultValues) {
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
            ...defaultValues,
          });
        }
      } catch (error) {
        console.error("Failed to load form data", error);
        toast.error("Failed to load wallets or categories");
      }
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(data: TransactionFormValues) {
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        amount: data.amount.toString(),
        attachmentIds: attachments.map((a) => a.id),
      };

      if (transactionId) {
        await updateTransaction(transactionId, payload);
        toast.success("Transaction updated");
      } else {
        await createTransaction(payload);
        toast.success("Transaction created");
      }
      form.reset();
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
    // Keep previously loaded refs where ID still chosen; new IDs use placeholder shape
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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Type tabs */}
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="expense">Expense</TabsTrigger>
            <TabsTrigger value="transfer">Transfer</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Amount */}
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                    {settings?.mainCurrencySymbol ?? "$"}
                  </span>
                  <CurrencyInput
                    value={field.value}
                    onChange={field.onChange}
                    currencySymbol={settings?.mainCurrencySymbol}
                    decimalPlaces={settings?.mainCurrencyDecimalPlaces}
                    className={
                      "pl-8 text-lg font-bold " +
                      (activeTab === "expense"
                        ? "text-red-600"
                        : activeTab === "income"
                          ? "text-green-600"
                          : "text-blue-600")
                    }
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Date + Wallet */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="walletId"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>From Wallet</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          "w-full justify-between pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground",
                        )}
                      >
                        {field.value
                          ? wallets.find((w) => w.id === field.value)?.name
                          : "Select wallet"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput placeholder="Search wallet..." />
                      <CommandList>
                        <CommandEmpty>No wallet found.</CommandEmpty>
                        <CommandGroup>
                          {wallets.map((wallet) => (
                            <CommandItem
                              value={wallet.name}
                              key={wallet.id}
                              onSelect={() =>
                                form.setValue("walletId", wallet.id)
                              }
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  wallet.id === field.value
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              {wallet.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* To Wallet (transfer only) */}
        {activeTab === "transfer" && (
          <FormField
            control={form.control}
            name="toWalletId"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>To Wallet</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          "w-full justify-between pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground",
                        )}
                      >
                        {field.value
                          ? wallets.find((w) => w.id === field.value)?.name
                          : "Select destination"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput placeholder="Search wallet..." />
                      <CommandList>
                        <CommandEmpty>No wallet found.</CommandEmpty>
                        <CommandGroup>
                          {wallets
                            .filter((w) => w.id !== form.getValues("walletId"))
                            .map((wallet) => (
                              <CommandItem
                                value={wallet.name}
                                key={wallet.id}
                                onSelect={() =>
                                  form.setValue("toWalletId", wallet.id)
                                }
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    wallet.id === field.value
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                {wallet.name}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Category (non-transfer only) */}
        {activeTab !== "transfer" && (
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Category</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          "w-full justify-between pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground",
                        )}
                      >
                        {field.value
                          ? filteredCategories.find((c) => c.id === field.value)
                              ?.name
                          : "Select category"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput placeholder="Search category..." />
                      <CommandList>
                        <CommandEmpty>No category found.</CommandEmpty>
                        <CommandGroup>
                          {filteredCategories.map((category) => (
                            <CommandItem
                              value={category.name}
                              key={category.id}
                              onSelect={() =>
                                form.setValue("categoryId", category.id)
                              }
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  category.id === field.value
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              {category.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Name (transaction title) */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. Grocery shopping, Salary…"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Description (rich text) */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <div className="min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <Editor
                    initialContent={field.value || ""}
                    placeholder="Add notes, links, or any details…"
                    onUpdate={(editor) => field.onChange(editor.getText())}
                    onBlur={field.onBlur}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Attachments */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Attachments</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVaultPickerOpen(true)}
            >
              <Paperclip className="w-3.5 h-3.5 mr-1.5" />
              Attach from Vault
            </Button>
          </div>

          {attachments.length > 0 && (
            <div className="space-y-1">
              {attachments.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30 text-sm"
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

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Saving…" : "Save Transaction"}
        </Button>
      </form>

      <VaultPickerModal
        open={vaultPickerOpen}
        onOpenChange={setVaultPickerOpen}
        selectedIds={attachments.map((a) => a.id)}
        onConfirm={handleVaultConfirm}
      />
    </Form>
  );
}
