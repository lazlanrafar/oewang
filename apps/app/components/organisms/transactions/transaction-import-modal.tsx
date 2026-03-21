"use client";
import { useQueryClient } from "@tanstack/react-query";

import { useMemo, useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Icons,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
} from "@workspace/ui";
import {
  Upload,
  X,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { formatCurrency as formatCurrencyUtil } from "@workspace/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import {
  ImportCsvContext,
  importSchema,
  type ImportCsvFormData,
} from "./transaction-import-context";
import { SelectFile } from "./transaction-import-select-file";
import { FieldMapping } from "./transaction-import-field-mapping";
import { ValueMapping } from "./transaction-import-value-mapping";
import {
  bulkCreateTransactions,
  createTransaction,
} from "@workspace/modules/transaction/transaction.action";
import { useAppStore } from "@/stores/app";

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  wallets: any[];
}

export function ImportModal({
  open,
  onOpenChange,
  wallets,
  onSuccess,
}: ImportModalProps) {
  const { settings, formatCurrency } = useAppStore();
  const [step, setStep] = useState<
    | "select"
    | "mapping"
    | "mapping-values"
    | "summary"
    | "uploading"
    | "success"
    | "error"
  >("select");
  const [fileColumns, setFileColumns] = useState<string[] | null>(null);
  const [firstRows, setFirstRows] = useState<Record<string, string>[] | null>(
    null,
  );
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

  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<ImportCsvFormData>({
    resolver: zodResolver(importSchema as any),
    defaultValues: {
      file: undefined,
      currency: settings?.mainCurrencyCode || "USD",
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
    if (wallets.length > 0 && !watch("walletId")) {
      setValue("walletId", wallets[0].id);
    }
  }, [wallets, setValue, watch]);

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
      toast.error(
        "Please map all required fields (Amount, Date, and Description)",
      );
      return;
    }

    if (!firstRows || firstRows.length === 0) {
      toast.error("No data to import");
      return;
    }

    setStep("uploading");

    try {
      // Helper to parse date dd/mm/yyyy
      const parseDate = (dateStr: string) => {
        if (!dateStr) return new Date().toISOString();
        const parts = dateStr.split("/");
        if (parts.length === 3) {
          const y = parts[2] || new Date().getFullYear().toString();
          const m = parts[1] || "01";
          const d = parts[0] || "01";
          return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T12:00:00Z`;
        }
        return new Date(dateStr).toISOString();
      };

      const transactionsToCreate = (firstRows || []).map((row) => {
        const rawAmount = row[data.amount] || "0";
        const amount = parseFloat(rawAmount.replace(/[^0-9.-]/g, ""));

        // Resolve type from value mapping
        const typeValue = data.type ? row[data.type] : undefined;
        const transactionType = typeValue
          ? valueMappings.types[typeValue] || "expense"
          : "expense";

        // Resolve category and wallet from value mappings
        const categoryValue = data.category ? row[data.category] : undefined;
        const resolvedCategoryId = categoryValue
          ? valueMappings.categories[categoryValue]
          : undefined;

        const walletValue = (data as any).walletIdColumn
          ? row[(data as any).walletIdColumn]
          : undefined;
        const resolvedWalletId = walletValue
          ? valueMappings.wallets[walletValue]
          : data.walletId;

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

      const res = await bulkCreateTransactions(transactionsToCreate as any);

      if (res.success && res.data) {
        setImportedCount(res.data.imported);
        setStep("success");
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        onSuccess();
        router.refresh();
      } else {
        setErrorMessage(res.error || "Failed to import transactions");
        setStep("error");
      }
    } catch (error) {
      setErrorMessage("An unexpected error occurred during import");
      setStep("error");
    }
  };

  const dateRange = useMemo(() => {
    if (!firstRows || firstRows.length === 0) return null;
    const dateCol = form.getValues("date");
    if (!dateCol) return null;

    const dates = firstRows
      .map((row) => {
        const val = row[dateCol];
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      })
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    if (dates.length === 0) return null;
    return {
      start: dates[0],
      end: dates[dates.length - 1],
    };
  }, [firstRows, form.watch("date")]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] font-sans h-[90vh] flex flex-col p-0 overflow-hidden text-foreground">
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
              <div className="flex items-center gap-3 mb-2">
                {(step === "mapping" ||
                  step === "mapping-values" ||
                  step === "summary") && (
                  <button
                    onClick={onBack}
                    className="p-1 hover:bg-muted rounded-md transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <DialogTitle className="text-xl font-sans font-semibold tracking-tight">
                  {step === "select" && "Select CSV File"}
                  {step === "mapping" && "Field Mapping"}
                  {step === "mapping-values" && "Value Mapping"}
                  {step === "summary" && "Import Summary"}
                  {step === "uploading" && "Importing..."}
                  {step === "success" && "Import Successful"}
                  {step === "error" && "Import Failed"}
                </DialogTitle>
              </div>
              <DialogDescription className="text-sm">
                {step === "select" &&
                  "Upload your transaction file to get started."}
                {step === "mapping" &&
                  "Map your CSV columns to the appropriate transaction fields."}
                {step === "mapping-values" &&
                  "Match CSV values to your accounts and categories."}
                {step === "summary" &&
                  "Review your import settings and confirm."}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {step === "select" && <SelectFile />}
            {step === "mapping" && <FieldMapping />}
            {step === "mapping-values" && (
              <ValueMapping onNext={() => setStep("summary")} />
            )}
            {step === "summary" && (
              <div className="space-y-6 font-sans">
                <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Import Summary
                    </p>
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-2xl font-bold tracking-tight">
                        {firstRows?.length || 0}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-medium">
                        Transactions found
                      </p>
                    </div>
                    {dateRange && (
                      <div className="space-y-1">
                        <p className="text-sm font-semibold truncate">
                          {dateRange.start!.toLocaleDateString()} -{" "}
                          {dateRange.end!.toLocaleDateString()}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-medium uppercase">
                          Date Range
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {!watch("walletIdColumn") && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-foreground/70 ml-1">
                        Destination Account
                      </Label>
                      <Controller
                        control={form.control}
                        name="walletId"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger className="h-11 bg-background border-border/60 hover:border-primary/50 transition-colors rounded-xl shadow-sm">
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
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-foreground/70 ml-1">
                      Default Currency
                    </Label>
                    <Controller
                      control={form.control}
                      name="currency"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="h-11 bg-background border-border/60 hover:border-primary/50 transition-colors rounded-xl shadow-sm">
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">USD - US Dollar</SelectItem>
                            <SelectItem value="EUR">EUR - Euro</SelectItem>
                            <SelectItem value="IDR">
                              IDR - Indonesian Rupiah
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === "uploading" && (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm font-medium">
                  Processing your transactions...
                </p>
              </div>
            )}

            {step === "success" && (
              <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
                <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-semibold">Done!</p>
                  <p className="text-sm text-muted-foreground">
                    Successfully imported {importedCount} transactions.
                  </p>
                </div>
                <Button onClick={() => handleClose(false)} className="mt-4">
                  Close
                </Button>
              </div>
            )}

            {step === "error" && (
              <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-semibold">Something went wrong</p>
                  <p className="text-sm text-muted-foreground max-w-[300px]">
                    {errorMessage}
                  </p>
                </div>
                <Button
                  onClick={() => setStep("summary")}
                  variant="outline"
                  className="mt-4"
                >
                  Try Again
                </Button>
              </div>
            )}
          </div>

          {(step === "select" ||
            step === "mapping" ||
            step === "mapping-values" ||
            step === "summary") && (
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/5 mt-auto shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>

              {step === "select" && (
                <Button size="sm" disabled={!fileColumns} onClick={onNext}>
                  Next: Field Mapping
                </Button>
              )}

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
                <Button
                  size="sm"
                  disabled={!isValid}
                  onClick={handleSubmit(onSubmit)}
                >
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
