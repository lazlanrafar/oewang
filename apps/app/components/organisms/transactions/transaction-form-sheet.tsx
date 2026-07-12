"use client";

import { useEffect, useMemo, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { type InfiniteData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { getWallets } from "@workspace/modules/client";
import { getExchangeRates } from "@workspace/modules/setting/setting.action";
import { createTransaction, updateTransaction } from "@workspace/modules/transaction/transaction.action";
import { getVaultDownloadUrl, uploadVaultFile } from "@workspace/modules/vault/vault.action";
import type { Transaction } from "@workspace/types";
import {
  Button,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui";
import { getCurrencyDisplayUnit } from "@workspace/utils";
import { File, FileText, Film, Image, Paperclip, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { FormSegmentedTabs } from "@/components/molecules/form-segmented-tabs";
import { SelectAccount } from "@/components/molecules/select-account";
import { SelectCategory } from "@/components/molecules/select-category";
import { SelectUser } from "@/components/molecules/select-user";
import { VaultPickerModal } from "@/components/molecules/vault-picker-modal";
import { useAppStore } from "@/stores/app";

const getTransactionSchema = (dictionary: Dictionary) =>
  z.object({
    amount: z.coerce.number().positive(dictionary.transactions.errors.amount_positive || "Amount must be positive"),
    currencyCode: z.string().min(1),
    exchangeRate: z.coerce.number().positive().optional(),
    date: z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
      message: dictionary.transactions.errors.invalid_date || "Invalid date",
    }),
    type: z.enum(["income", "expense", "transfer", "transfer-in", "transfer-out"]),
    walletId: z.string().min(1, dictionary.transactions.errors.wallet_required),
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
  if (type.startsWith("image/")) return <Image className="h-4 w-4" />;
  if (type.startsWith("video/")) return <Film className="h-4 w-4" />;
  if (type === "application/pdf") return <FileText className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
}

function AttachmentCard({
  file,
  onRemove,
}: {
  file: { id: string; name: string; type: string; size: number };
  onRemove: (id: string) => void;
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
    <div className="group relative aspect-square cursor-default overflow-hidden border bg-muted/10 transition-colors hover:bg-muted/20">
      {/* Thumbnail or icon */}
      {isImage ? (
        url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={file.name} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/20">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
          <FileIcon type={file.type} />
          <span className="line-clamp-2 text-center text-[9px] leading-tight">{file.name}</span>
        </div>
      )}

      {/* Hover overlay with name + size */}
      <div className="absolute inset-0 flex flex-col items-start justify-end bg-linear-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <p className="line-clamp-1 w-full font-medium text-[9px] text-white leading-tight">{file.name}</p>
        {file.size > 0 && <p className="text-[8px] text-white/70">{formatBytes(file.size)}</p>}
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(file.id);
        }}
        className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center bg-black/60 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction;
  onSuccess?: () => void;
  dictionary: Dictionary;
  canEdit?: boolean;
}

export function TransactionFormSheet({
  open,
  onOpenChange,
  transaction,
  onSuccess,
  dictionary,
  canEdit = true,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TransactionFormValues["type"]>(
    (transaction?.type as TransactionFormValues["type"]) || "expense",
  );
  const [attachments, setAttachments] = useState<VaultFileRef[]>([]);
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const { settings, user, subCurrencies, formatCurrency } = useAppStore();
  const mainCurrencyCode = settings?.mainCurrencyCode || "USD";
  const currencyUnit = getCurrencyDisplayUnit(settings?.mainCurrencyCode, settings?.mainCurrencySymbol);

  const { data: ratesResp, isLoading: isRatesLoading } = useQuery({
    queryKey: ["settings", "rates", mainCurrencyCode],
    queryFn: () => getExchangeRates(mainCurrencyCode),
    enabled: subCurrencies.length > 0 && open,
    staleTime: 1000 * 60 * 15,
  });

  const { data: walletsData } = useQuery({
    queryKey: ["wallets"],
    queryFn: async () => {
      const res = await getWallets();
      if (!res.success) throw new Error(res.message);
      return res.data || [];
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    enabled: open,
  });
  const defaultWalletId =
    walletsData?.find((w) => w.isDefault)?.id || walletsData?.[0]?.id || "";

  // ratesMap[code] = how many `code` you get for 1 main currency. To get
  // `1 code = X main` we invert: X = 1 / ratesMap[code].
  const ratesMap: Record<string, string> =
    ratesResp?.success && ratesResp.data ? (ratesResp.data as Record<string, string>) : {};
  const liveRateFor = (code: string): number | null => {
    if (code === mainCurrencyCode) return 1;
    const mainPerSub = Number(ratesMap[code]);
    if (!mainPerSub || Number.isNaN(mainPerSub)) return null;
    return 1 / mainPerSub;
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const schema = useMemo(() => getTransactionSchema(dictionary), [dictionary]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "expense",
      date: new Date().toISOString().split("T")[0],
      amount: 0,
      currencyCode: mainCurrencyCode,
      exchangeRate: 1,
      name: "",
      description: "",
      walletId: "",
      categoryId: "",
      toWalletId: "",
      assignedUserId: user?.id ?? "",
      attachmentIds: [],
    },
  });

  const watchedCurrency = form.watch("currencyCode");
  const watchedAmount = form.watch("amount");
  const watchedRate = form.watch("exchangeRate");
  const isMainCurrency = watchedCurrency === mainCurrencyCode;
  const convertedAmount = !isMainCurrency
    ? Number(watchedAmount || 0) * Number(watchedRate || 0)
    : 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: defaultWalletId is intentionally read at reset time only; the dedicated effect below fills it in when wallets load late, without wiping user input.
  useEffect(() => {
    const loadData = async () => {
      try {
        if (transaction) {
          const hasOriginalCurrency =
            !!transaction.originalCurrencyCode &&
            transaction.originalCurrencyCode !== mainCurrencyCode;
          form.reset({
            amount: hasOriginalCurrency
              ? Number(transaction.originalAmount ?? transaction.amount)
              : Number(transaction.amount),
            currencyCode: transaction.originalCurrencyCode || mainCurrencyCode,
            exchangeRate: transaction.exchangeRate ? Number(transaction.exchangeRate) : 1,
            date:
              typeof transaction?.date === "string"
                ? transaction?.date.slice(0, 10)
                : new Date(transaction?.date).toISOString().slice(0, 10),
            type: transaction?.type as "income" | "expense" | "transfer",
            walletId: transaction?.walletId ?? "",
            toWalletId: transaction?.toWalletId ?? "",
            categoryId: transaction?.categoryId ?? "",
            name: transaction?.name ?? "",
            description: transaction?.description ?? "",
            attachmentIds: transaction?.attachmentIds ?? [],
            assignedUserId: transaction?.assignedUserId ?? "",
          });
          setAttachments(transaction?.attachments ?? []);
          setActiveTab(transaction?.type as TransactionFormValues["type"]);
        } else {
          form.reset({
            type: "expense",
            date: new Date().toISOString().split("T")[0],
            amount: 0,
            currencyCode: mainCurrencyCode,
            exchangeRate: 1,
            name: "",
            description: "",
            walletId: defaultWalletId,
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
  }, [open, transaction, form, user?.id, mainCurrencyCode]);

  // When wallets finish loading after the sheet is already open, fill in the
  // default wallet if the user hasn't picked one yet. Done with setValue (not
  // reset) so other fields the user may have already typed are preserved.
  useEffect(() => {
    if (!open || transaction || !defaultWalletId) return;
    if (!form.getValues("walletId")) {
      form.setValue("walletId", defaultWalletId);
    }
  }, [open, transaction, defaultWalletId, form]);

  // Transfer is single-currency only; snap back to main if user switches type.
  useEffect(() => {
    if (activeTab === "transfer" && watchedCurrency !== mainCurrencyCode) {
      form.setValue("currencyCode", mainCurrencyCode);
      form.setValue("exchangeRate", 1);
    }
  }, [activeTab, watchedCurrency, mainCurrencyCode, form]);

  // Auto-populate exchange rate when user picks a non-main currency, unless the
  // user has manually edited the rate this session.
  const [rateManuallyEdited, setRateManuallyEdited] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: rate auto-populate keyed on currency/ratesResp only; liveRateFor/watchedRate/form.setValue are stable-or-derived and re-running on them would fight the user's manual edits.
  useEffect(() => {
    if (isMainCurrency) {
      if (Number(watchedRate) !== 1) form.setValue("exchangeRate", 1);
      return;
    }
    if (rateManuallyEdited) return;
    const live = liveRateFor(watchedCurrency);
    if (live != null && Number.isFinite(live) && Number(watchedRate || 0) !== live) {
      form.setValue("exchangeRate", Number(live.toFixed(8)));
    }
  }, [watchedCurrency, ratesResp, isMainCurrency, rateManuallyEdited]);

  async function onSubmit(data: TransactionFormValues) {
    if (!dictionary) return;
    setIsLoading(true);
    try {
      const usingSubCurrency = data.currencyCode !== mainCurrencyCode;
      const rate = Number(data.exchangeRate ?? 1);
      const mainAmount = usingSubCurrency ? data.amount * rate : data.amount;

      const { currencyCode, exchangeRate, ...rest } = data;
      const payload = {
        ...rest,
        amount: mainAmount.toString(),
        originalAmount: usingSubCurrency ? data.amount.toString() : null,
        originalCurrencyCode: usingSubCurrency ? currencyCode : null,
        exchangeRate: usingSubCurrency ? rate.toString() : null,
        attachmentIds: attachments.map((a) => a.id),
      };

      if (transaction?.id) {
        const result = await updateTransaction(transaction?.id, payload);
        if (!result.success) {
          throw new Error(result.error || dictionary.transactions.errors.save_failed);
        }
        toast.success(dictionary.transactions.toasts.updated);

        // Optimistically patch the updated transaction in every matching cache
        if (result.data) {
          const updated = result.data as Transaction;
          queryClient.setQueriesData<any>({ queryKey: ["transactions"], exact: false }, (old: any) => {
            if (!old) return old;

            // Handle infinite queries (has pages)
            if ("pages" in old && Array.isArray(old.pages)) {
              return {
                ...old,
                pages: old.pages.map((page: any) => ({
                  ...page,
                  data: (page.data ?? []).map((tx: Transaction) => (tx.id === updated.id ? { ...tx, ...updated } : tx)),
                })),
              };
            }

            // Handle regular queries (has data array directly)
            if ("data" in old && Array.isArray(old.data)) {
              return {
                ...old,
                data: old.data.map((tx: Transaction) => (tx.id === updated.id ? { ...tx, ...updated } : tx)),
              };
            }

            return old;
          });
        }
      } else {
        const result = await createTransaction(payload);
        if (!result.success) {
          throw new Error(result.error || dictionary.transactions.errors.save_failed);
        }
        toast.success(dictionary.transactions.toasts.created);

        // Optimistically prepend the new transaction to the first page of every
        // matching cache so it appears instantly without waiting for refetch.
        if (result.data) {
          const created = result.data as Transaction;
          queryClient.setQueriesData<any>({ queryKey: ["transactions"], exact: false }, (old: any) => {
            if (!old) return old;

            // Handle infinite queries (has pages)
            if ("pages" in old && Array.isArray(old.pages)) {
              const [firstPage, ...restPages] = old.pages;
              if (!firstPage) return old;
              return {
                ...old,
                pages: [
                  {
                    ...firstPage,
                    data: [created, ...(firstPage.data ?? [])],
                  },
                  ...restPages,
                ],
              };
            }

            // Handle regular queries (has data array directly)
            if ("data" in old && Array.isArray(old.data)) {
              return {
                ...old,
                data: [created, ...old.data],
              };
            }

            return old;
          });
        }
      }

      form.reset();
      setAttachments([]);
      onOpenChange(false);
      onSuccess?.();
      // Background reconciliation — updates totals, pagination, etc.
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : dictionary.transactions.errors.save_failed);
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
      return existing ?? { id, name: id, size: 0, type: "application/octet-stream" };
    });
    setAttachments(newAttachments);
  };

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

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
        throw new Error(`Invalid file type for ${file.name}. Only documents and images are allowed.`);
      }
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadVaultFile(formData);
      if (result.success) return result.data;
      throw new Error(result.error);
    },
    onSuccess: (data: { id: string; name: string; size: number; type: string }) => {
      queryClient.invalidateQueries({ queryKey: ["vault-files"] });
      setAttachments((prev) => {
        if (prev.find((a) => a.id === data.id)) return prev;
        return [...prev, { id: data.id, name: data.name, size: data.size, type: data.type }];
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || dictionary.transactions.errors.upload_failed);
    },
  });

  const handleUploadFiles = async (selectedFiles: FileList | File[]) => {
    if (!dictionary) return;
    const filesArray = Array.from(selectedFiles);
    if (filesArray.length === 0) return;

    const toastId = toast.loading(
      dictionary.transactions.uploading_files.replace("{count}", filesArray.length.toString()),
    );

    try {
      await Promise.all(filesArray.map((file) => uploadMutation.mutateAsync(file)));
      toast.success(dictionary.transactions.all_uploads_success, {
        id: toastId,
      });
    } catch (_error) {
      toast.error(dictionary.transactions.errors.some_uploads_failed, {
        id: toastId,
      });
    }
  };

  if (!mounted || !dictionary || !canEdit) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col p-0">
        <SheetHeader className="shrink-0 px-6 pt-6">
          <SheetTitle className="text-lg">
            {transaction ? dictionary.transactions.edit_transaction : dictionary.transactions.new_transaction}
          </SheetTitle>
        </SheetHeader>

        <div className="no-scrollbar flex-1 overflow-y-auto px-6 pt-6 pb-[120px]">
          <Form {...form}>
            <form id="transaction-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormSegmentedTabs
                value={activeTab}
                disabled={!!transaction}
                onChange={handleTabChange}
                options={[
                  {
                    value: "expense",
                    label: dictionary.transactions.types.expense,
                  },
                  {
                    value: "income",
                    label: dictionary.transactions.types.income,
                  },
                  {
                    value: "transfer",
                    label: dictionary.transactions.types.transfer,
                  },
                ]}
              />
              <FormDescription className="mt-[-10px]">{dictionary.transactions.hints.type}</FormDescription>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-normal text-muted-foreground text-xs">{dictionary.transactions.description_label}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={dictionary.transactions.placeholders.description}
                        {...field}
                        value={field.value ?? ""}
                        className="bg-transparent transition-colors focus:border-foreground"
                      />
                    </FormControl>
                    <FormDescription>
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
                      <FormLabel className="font-normal text-muted-foreground text-xs">{dictionary.transactions.amount_label}</FormLabel>
                      <FormControl>
                        <div className="group relative">
                          <span className="-translate-y-1/2 absolute top-1/2 left-3 text-muted-foreground/50 text-sm transition-colors group-focus-within:text-foreground">
                            {getCurrencyDisplayUnit(watchedCurrency, isMainCurrency ? settings?.mainCurrencySymbol : undefined)}
                          </span>
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
                            currencySymbol={isMainCurrency ? settings?.mainCurrencySymbol : undefined}
                            decimalPlaces={isMainCurrency ? settings?.mainCurrencyDecimalPlaces : 2}
                            className={cn(
                              "bg-transparent pl-14 font-serif text-sm tabular-nums transition-colors focus:border-foreground",
                              activeTab === "expense"
                                ? "text-red-500"
                                : activeTab === "income"
                                  ? "text-green-500"
                                  : "text-blue-500",
                            )}
                          />
                        </div>
                      </FormControl>
                      <FormDescription className="min-h-[2lh]">{dictionary.transactions.hints.amount}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currencyCode"
                  render={({ field }) => {
                    const transferLocked = activeTab === "transfer";
                    return (
                      <FormItem>
                        <FormLabel className="font-normal text-muted-foreground text-xs">
                          {dictionary.transactions.currency_label}
                        </FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(v) => {
                            setRateManuallyEdited(false);
                            field.onChange(v);
                          }}
                          disabled={transferLocked || subCurrencies.length === 0}
                        >
                          <SelectTrigger className="w-full bg-transparent transition-colors focus:border-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={mainCurrencyCode}>{mainCurrencyCode}</SelectItem>
                            {subCurrencies.map((sc) => (
                              <SelectItem key={sc.id} value={sc.currencyCode}>
                                {sc.currencyCode}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription className="min-h-[2lh]">{dictionary.transactions.hints.currency}</FormDescription>
                      </FormItem>
                    );
                  }}
                />
              </div>

              {!isMainCurrency && (
                <div className="grid grid-cols-2 gap-4 border bg-muted/5 p-3">
                  <FormField
                    control={form.control}
                    name="exchangeRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-normal text-muted-foreground text-xs">
                          {dictionary.transactions.exchange_rate_label || "Exchange rate"}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={field.value ?? ""}
                            onChange={(e) => {
                              setRateManuallyEdited(true);
                              field.onChange(e.target.value === "" ? undefined : Number(e.target.value));
                            }}
                            className="bg-transparent transition-colors focus:border-foreground"
                          />
                        </FormControl>
                        <FormDescription>
                          {(dictionary.transactions.exchange_rate_hint || "1 {from} = {rate} {to}")
                            .replace("{from}", watchedCurrency)
                            .replace(
                              "{rate}",
                              Number(field.value || 0).toLocaleString(undefined, {
                                maximumSignificantDigits: 6,
                              }),
                            )
                            .replace("{to}", mainCurrencyCode)}
                          {isRatesLoading ? " …" : ""}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormItem>
                    <FormLabel className="font-normal text-muted-foreground text-xs">
                      {(dictionary.transactions.converted_amount_label || "Converted to {currency}").replace(
                        "{currency}",
                        mainCurrencyCode,
                      )}
                    </FormLabel>
                    <div className="flex h-9 items-center border border-input bg-muted/10 px-3 font-serif text-sm tabular-nums">
                      {formatCurrency(convertedAmount || 0)}
                    </div>
                    <FormDescription>
                      {(dictionary.transactions.converted_amount_hint ||
                        "Stored in {main} for reports").replace("{main}", mainCurrencyCode)}
                    </FormDescription>
                  </FormItem>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="walletId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-normal text-muted-foreground text-xs">{dictionary.transactions.account}</FormLabel>
                      <FormControl>
                        <SelectAccount
                          value={field.value ?? undefined}
                          onChange={(id) => form.setValue("walletId", id)}
                          className="w-full justify-start bg-transparent px-3 text-left font-normal transition-colors hover:bg-muted/10 hover:bg-transparent"
                        />
                      </FormControl>
                      <FormDescription className="min-h-[2lh]">{dictionary.transactions.hints.account}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-normal text-muted-foreground text-xs">{dictionary.transactions.date_label}</FormLabel>
                      <FormControl>
                        <InputDate
                          value={field.value}
                          onChange={field.onChange}
                          className="bg-transparent transition-colors focus:border-foreground"
                        />
                      </FormControl>
                      <FormDescription className="min-h-[2lh]">{dictionary.transactions.hints.date}</FormDescription>
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
                      <FormItem>
                        <FormLabel className="font-normal text-muted-foreground text-xs">{dictionary.transactions.category}</FormLabel>
                        <FormControl>
                          <SelectCategory
                            value={field.value ?? undefined}
                            type={activeTab === "income" ? "income" : "expense"}
                            onChange={(id) => form.setValue("categoryId", id)}
                          />
                        </FormControl>
                        <FormDescription className="min-h-[2lh]">
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
                      <FormItem>
                        <FormLabel className="font-normal text-muted-foreground text-xs">{dictionary.transactions.to_account}</FormLabel>
                        <FormControl>
                          <SelectAccount
                            value={field.value ?? undefined}
                            onChange={(id) => form.setValue("toWalletId", id)}
                            placeholder={dictionary.transactions.placeholders.destination}
                          />
                        </FormControl>
                        <FormDescription className="min-h-[2lh]">
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
                    <FormItem>
                      <FormLabel className="font-normal text-muted-foreground text-xs">{dictionary.transactions.assign}</FormLabel>
                      <FormControl>
                        <SelectUser
                          value={field.value ?? undefined}
                          onChange={(id) => form.setValue("assignedUserId", id)}
                          placeholder={dictionary.transactions.placeholders.member}
                        />
                      </FormControl>
                      <FormDescription className="min-h-[2lh]">{dictionary.transactions.hints.assign}</FormDescription>
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
                    <FormLabel className="font-normal text-muted-foreground text-xs">{dictionary.transactions.notes_label}</FormLabel>
                    <FormControl>
                      <div className="mb-4 min-h-[120px] border bg-transparent px-3 py-2 text-sm transition-colors focus-within:border-foreground focus-within:ring-0">
                        <Editor
                          initialContent={field.value || ""}
                          placeholder={dictionary.transactions.placeholders.notes}
                          onUpdate={(editor) => field.onChange(editor.getHTML())}
                          onBlur={field.onBlur}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>{dictionary.transactions.hints.notes}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="mb-10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    {dictionary.transactions.attachments}
                  </span>
                </div>

                {attachments.length > 0 && (
                  <div className="mb-4 grid grid-cols-3 gap-2">
                    {attachments.map((file) => (
                      <AttachmentCard key={file.id} file={file} onRemove={removeAttachment} />
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  className="group relative mt-2 flex w-full cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden border-2 border-dashed bg-muted/5 px-6 py-10 transition-all hover:border-border/60 hover:bg-muted/10"
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
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setVaultPickerOpen(true);
                    }
                  }}
                >
                  <div className="rounded-full border border-border/20 bg-background p-2.5 shadow-sm transition-transform group-hover:scale-110">
                    <Paperclip className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                  </div>
                  <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">{dictionary.transactions.click_to_browse}</span>{" "}
                    {dictionary.transactions.drag_drop}
                    <br />
                    <span className="text-[10px] opacity-60">{dictionary.transactions.upload_hint}</span>
                  </p>

                  {uploadMutation.isPending && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
                      <span className="animate-pulse font-medium text-xs">{dictionary.transactions.saving}</span>
                    </div>
                  )}
                </button>
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

        <div className="absolute right-0 bottom-0 left-0 bg-background p-6">
          <Button
            form="transaction-form"
            type="submit"
            className="w-full"
            disabled={isLoading || !form.formState.isDirty}
          >
            {isLoading ? dictionary.transactions.saving : dictionary.transactions.save_transaction}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
