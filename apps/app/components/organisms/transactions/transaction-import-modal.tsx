"use client";
import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { bulkCreateTransactions } from "@workspace/modules/transaction/transaction.action";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { useAppStore } from "@/stores/app";

import { ImportCsvContext, type ImportCsvFormData, importSchema } from "./transaction-import-context";
import { FieldMapping } from "./transaction-import-field-mapping";
import { SelectFile } from "./transaction-import-select-file";
import { ValueMapping } from "./transaction-import-value-mapping";

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  wallets: WalletOption[];
}

interface WalletOption {
  id: string;
  name: string;
}

export function ImportModal({ open, onOpenChange, wallets, onSuccess }: ImportModalProps) {
  const { settings, subCurrencies } = useAppStore();
  const [step, setStep] = useState<
    "select" | "mapping" | "mapping-values" | "summary" | "uploading" | "success" | "error"
  >("select");
  const [fileColumns, setFileColumns] = useState<string[] | null>(null);
  const [firstRows, setFirstRows] = useState<Record<string, string>[] | null>(null);
  const [valueMappings, setValueMappings] = useState<{
    categories: Record<string, string>;
    wallets: Record<string, string>;
    types: Record<string, string>;
  }>({
    categories: {},
    wallets: {},
    types: {},
  });
  const [importedCount, setImportedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [importFailures, setImportFailures] = useState<{ index: number; reason: string }[]>([]);

  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<ImportCsvFormData>({
    resolver: zodResolver(importSchema),
    defaultValues: {
      file: undefined,
      currency: "",
      walletId: "",
      amount: "",
      date: "",
      type: "",
      category: "",
      name: "",
      inverted: false,
    },
  });

  const {
    reset,
    handleSubmit,
    watch,
    setValue,
    formState: { isValid },
  } = form;

  const handleClose = (v: boolean) => {
    if (!v) {
      setStep("select");
      setFileColumns(null);
      setFirstRows(null);
      setValueMappings({ categories: {}, wallets: {}, types: {} });
      reset();
    }
    onOpenChange(v);
  };

  // Auto-transition to mapping after file is selected and parsed
  useEffect(() => {
    if (step === "select" && fileColumns && fileColumns.length > 0) {
      setStep("mapping");
    }
  }, [fileColumns, step]);

  // Set default wallet if none selected
  useEffect(() => {
    const firstWallet = wallets[0];
    if (firstWallet && !watch("walletId")) {
      setValue("walletId", firstWallet.id);
    }
  }, [wallets, setValue, watch]);

  // Set default currency from settings — runs whenever settings loads,
  // using getValues() to avoid the stale-closure issue with watch()
  useEffect(() => {
    if (settings?.mainCurrencyCode) {
      const current = form.getValues("currency");
      if (!current) {
        setValue("currency", settings.mainCurrencyCode);
      }
    }
  }, [settings?.mainCurrencyCode, form, setValue]);

  const onNext = () => {
    if (step === "select") setStep("mapping");
    else if (step === "mapping") {
      const categoryCol = watch("category");
      const walletCol = watch("walletIdColumn");
      const typeCol = watch("type");
      if (categoryCol || walletCol || typeCol) {
        setStep("mapping-values");
      } else {
        setStep("summary");
      }
    } else if (step === "mapping-values") {
      setStep("summary");
    }
  };

  const onBack = () => {
    if (step === "mapping") setStep("select");
    else if (step === "mapping-values") setStep("mapping");
    else if (step === "summary") {
      const categoryCol = watch("category");
      const walletCol = watch("walletIdColumn");
      const typeCol = watch("type");
      if (categoryCol || walletCol || typeCol) {
        setStep("mapping-values");
      } else {
        setStep("mapping");
      }
    }
  };

  const onSubmit = async (data: ImportCsvFormData) => {
    if (!data.walletId && !data.walletIdColumn) {
      toast.error("Account is required");
      return;
    }
    if (!data.amount || !data.date || !data.name) {
      toast.error("Please map all required fields (Amount, Date, and Description)");
      return;
    }

    if (!firstRows || firstRows?.length === 0) {
      toast.error("No data to import");
      return;
    }

    setStep("uploading");

    try {
      // Helper to parse date dd/mm/yyyy
      const parseDate = (dateStr: unknown) => {
        if (!dateStr) return new Date().toISOString();
        const str = String(dateStr);
        const parts = str.split("/");
        try {
          if (parts.length === 3) {
            const y = parts[2] || new Date().getFullYear().toString();
            const m = parts[1] || "01";
            const d = parts[0] || "01";
            return new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T12:00:00Z`).toISOString();
          }
          return new Date(str).toISOString();
        } catch (_e) {
          return new Date().toISOString();
        }
      };

      const transactionsToCreate = (firstRows || []).map((row) => {
        const rawAmount = row[data.amount] || "0";
        const amount = parseFloat(String(rawAmount).replace(/[^0-9.-]/g, ""));

        // Resolve type from value mapping
        const typeValue = data.type ? row[data.type] : undefined;
        const transactionType = typeValue ? valueMappings.types[typeValue] || "expense" : "expense";

        // Resolve category and wallet from value mappings
        const categoryValue = data.category ? row[data.category] : undefined;
        const resolvedCategoryId = categoryValue ? valueMappings.categories[categoryValue] : undefined;

        const walletValue = data.walletIdColumn ? row[data.walletIdColumn] : undefined;
        const resolvedWalletId =
          (walletValue ? valueMappings.wallets[walletValue] : undefined) || data.walletId;

        return {
          walletId: resolvedWalletId,
          amount: (data.inverted ? -amount : amount).toString(),
          date: parseDate(row[data.date] || ""),
          type: transactionType,
          name: row[data.name] || "Imported Transaction",
          categoryId: resolvedCategoryId,
          description: data.category ? `Category: ${row[data.category]}` : "",
        };
      });

      const res = await bulkCreateTransactions(transactionsToCreate);

      if (res.success && res.data) {
        setImportedCount(res.data.imported);
        setImportFailures(res.data.failures || []);

        if (res.data.imported > 0) {
          setStep("success");
          await queryClient.invalidateQueries({ queryKey: ["transactions"] });
          onSuccess();
          router.refresh();
        } else {
          setErrorMessage("All transactions failed to import");
          setStep("error");
        }
      } else {
        setErrorMessage(res.error || "Failed to import transactions");
        setImportFailures([]);
        setStep("error");
      }
    } catch (error: unknown) {
      console.error("[Import Error]", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred during import";
      setErrorMessage(errorMessage);
      setStep("error");
    }
  };

  const dateRange = useMemo(() => {
    if (!firstRows || firstRows?.length === 0) return null;
    const dateCol = form.getValues("date");
    if (!dateCol) return null;

    const dates = firstRows
      .map((row) => {
        const val = row[dateCol];
        if (!val) return null;
        const d = new Date(val);
        return Number.isNaN(d.getTime()) ? null : d;
      })
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    if (dates.length === 0) return null;
    return {
      start: dates[0],
      end: dates[dates.length - 1],
    };
  }, [firstRows, form.getValues]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex h-fit max-h-[90vh] flex-col overflow-hidden p-0 font-sans text-foreground sm:max-w-[700px]">
        <ImportCsvContext.Provider
          value={{
            fileColumns,
            setFileColumns,
            firstRows,
            setFirstRows,
            control: form.control,
            watch: form.watch,
            setValue: form.setValue,
            valueMappings,
            setValueMappings,
          }}
        >
          <div className="p-6 pb-0">
            <DialogHeader>
              <div className="mb-2 flex items-center gap-3">
                {(step === "mapping" || step === "mapping-values" || step === "summary") && (
                  <button type="button" onClick={onBack} className="rounded-md p-1 transition-colors hover:bg-muted">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <DialogTitle className="font-medium">
                  {step === "select" && "Select File"}
                  {step === "mapping" && "Field Mapping"}
                  {step === "mapping-values" && "Value Mapping"}
                  {step === "summary" && "Import Summary"}
                  {step === "uploading" && "Importing..."}
                  {step === "success" && "Import Successful"}
                  {step === "error" && "Import Failed"}
                </DialogTitle>
              </div>
              <DialogDescription className="text-sm">
                {step === "select" && "Upload your transaction file to get started."}
                {step === "mapping" && "Map your file columns to the appropriate transaction fields."}
                {step === "mapping-values" && "Match values from your file to your accounts and categories."}
                {step === "summary" && "Review your import settings and confirm."}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {step === "select" && <SelectFile />}
            {step === "mapping" && <FieldMapping />}
            {step === "mapping-values" && <ValueMapping onNext={() => setStep("summary")} />}
            {step === "summary" && (
              <div className="space-y-6 font-sans">
                <div className="space-y-4 border bg-primary/5 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">Import Summary</p>
                    <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="font-bold text-2xl tracking-tight">{firstRows?.length || 0}</p>
                      <p className="font-medium text-[11px] text-muted-foreground">Transactions found</p>
                    </div>
                    {dateRange && (
                      <div className="space-y-1">
                        <p className="truncate font-semibold text-sm">
                          {dateRange.start?.toLocaleDateString()} - {dateRange.end?.toLocaleDateString()}
                        </p>
                        <p className="font-medium text-[11px] text-muted-foreground uppercase">Date Range</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="ml-1 font-semibold text-foreground/70 text-xs">
                      {watch("walletIdColumn") ? "Fallback Account" : "Destination Account"}
                    </Label>
                    <Controller
                      control={form.control}
                      name="walletId"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="h-11 border-border/60 bg-background shadow-sm transition-colors hover:border-primary/50">
                            <SelectValue placeholder="Select an account" />
                          </SelectTrigger>
                          <SelectContent>
                            {wallets.map((wallet) => (
                              <SelectItem key={wallet.id} value={wallet.id}>
                                {wallet.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {watch("walletIdColumn") && (
                      <p className="ml-1 text-muted-foreground text-xs">
                        Used when the mapped account column is empty or a value was not matched.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="ml-1 font-semibold text-foreground/70 text-xs">Default Currency</Label>
                    <Controller
                      control={form.control}
                      name="currency"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="h-11 border-border/60 bg-background shadow-sm transition-colors hover:border-primary/50">
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                          <SelectContent>
                            {settings?.mainCurrencyCode && (
                              <SelectItem value={settings?.mainCurrencyCode}>{settings?.mainCurrencyCode}</SelectItem>
                            )}
                            {subCurrencies.map((sc) => (
                              <SelectItem key={sc.id} value={sc.currencyCode}>
                                {sc.currencyCode}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === "uploading" && (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="font-medium text-sm">Processing your transactions...</p>
              </div>
            )}

            {step === "success" && (
              <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-lg">Done!</p>
                  <p className="text-muted-foreground text-sm">Successfully imported {importedCount} transactions.</p>
                  {importFailures.length > 0 && (
                    <div className="mt-4 rounded-lg border border-amber-500/10 bg-amber-500/5 p-3 text-left">
                      <p className="mb-2 flex items-center gap-1 font-semibold text-amber-600 text-xs">
                        <AlertCircle className="h-3 w-3" />
                        {importFailures.length} rows skipped due to errors:
                      </p>
                      <ul className="max-h-[150px] space-y-1 overflow-y-auto pr-2 text-[11px] text-muted-foreground">
                        {importFailures.map((f) => (
                          <li key={`${f.index}-${f.reason}`} className="flex gap-2">
                            <span className="w-12 shrink-0 font-medium text-foreground/70">Row {f.index + 1}:</span>
                            <span>{f.reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <Button onClick={() => handleClose(false)} className="mt-4">
                  Close
                </Button>
              </div>
            )}

            {step === "error" && (
              <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-lg">Something went wrong</p>
                  <p className="max-w-[300px] text-muted-foreground text-sm">{errorMessage}</p>
                  {importFailures.length > 0 && (
                    <div className="mt-4 max-w-[350px] rounded-lg border border-destructive/10 bg-destructive/5 p-3 text-left">
                      <p className="mb-2 font-semibold text-destructive/80 text-xs">Common issues:</p>
                      <ul className="max-h-[150px] space-y-1 overflow-y-auto pr-2 text-[11px] text-muted-foreground">
                        {importFailures.slice(0, 10).map((f) => (
                          <li key={`${f.index}-${f.reason}`} className="flex gap-2">
                            <span className="w-12 shrink-0 font-medium text-foreground/70">Row {f.index + 1}:</span>
                            <span>{f.reason}</span>
                          </li>
                        ))}
                        {importFailures.length > 10 && (
                          <li className="pt-1 text-center font-medium italic">
                            ...and {importFailures.length - 10} more rows
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
                <Button onClick={() => setStep("summary")} variant="outline" className="mt-4">
                  Try Again
                </Button>
              </div>
            )}
          </div>

          {(step === "mapping" || step === "mapping-values" || step === "summary") && (
            <div className="mt-auto flex shrink-0 items-center justify-end gap-3 border-border border-t bg-muted/5 px-6 py-4">
              <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>
                Cancel
              </Button>

              {step === "mapping" && (
                <Button size="sm" onClick={onNext}>
                  Next
                </Button>
              )}

              {step === "mapping-values" && (
                <Button size="sm" onClick={onNext}>
                  Next: Summary
                </Button>
              )}

              {step === "summary" && (
                <Button size="sm" disabled={!isValid} onClick={handleSubmit(onSubmit)}>
                  Confirm Import
                </Button>
              )}
            </div>
          )}
        </ImportCsvContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
