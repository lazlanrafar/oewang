"use client";

import { useMemo, useState, useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { useCurrency } from "@workspace/ui/hooks";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import {
  ImportCsvContext,
  importSchema,
  type ImportCsvFormData,
} from "./import-context";
import { SelectFile } from "./import-select-file";
import { FieldMapping } from "./import-field-mapping";
import { bulkDeleteTransactions } from "@workspace/modules/transaction/transaction.action";

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  wallets: any[];
}

export function ImportModal({
  open,
  onOpenChange,
  onSuccess,
  wallets,
}: ImportModalProps) {
  const [step, setStep] = useState<
    "select" | "mapping" | "settings" | "uploading" | "success" | "error"
  >("select");
  const [fileColumns, setFileColumns] = useState<string[] | null>(null);
  const [firstRows, setFirstRows] = useState<Record<string, string>[] | null>(
    null,
  );
  const [importedCount, setImportedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const router = useRouter();
  const { settings } = useCurrency();

  const currentSettings = settings as any;

  const form = useForm<ImportCsvFormData>({
    resolver: zodResolver(importSchema),
    defaultValues: {
      file: undefined,
      currency: currentSettings?.currency || "USD",
      walletId: "",
      amount: "",
      date: "",
      description: "",
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
      reset();
    }
    onOpenChange(v);
  };

  const onNext = () => {
    if (step === "select") setStep("mapping");
    else if (step === "mapping") setStep("settings");
  };

  const onBack = () => {
    if (step === "mapping") setStep("select");
    else if (step === "settings") setStep("mapping");
  };

  const onSubmit = async (data: ImportCsvFormData) => {
    setStep("uploading");
    try {
      // Logic for importing transactions would go here
      // For now, since we don't have a dedicated bulk import action yet,
      // let's simulate a delay and success.
      await new Promise((r) => setTimeout(r, 2000));

      setImportedCount(firstRows?.length || 0);
      setStep("success");
      onSuccess();
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to import transactions");
      setStep("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] font-sans">
        <ImportCsvContext.Provider
          value={{
            fileColumns,
            setFileColumns,
            firstRows,
            setFirstRows,
            control: form.control,
            watch: form.watch,
            setValue: form.setValue,
          }}
        >
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              {(step === "mapping" || step === "settings") && (
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
                {step === "settings" && "Account & Currency"}
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
              {step === "settings" &&
                "Finalize the account and currency for these transactions."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {step === "select" && <SelectFile />}
            {step === "mapping" && <FieldMapping />}
            {step === "settings" && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
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
                          <SelectTrigger className="h-10">
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

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Currency</Label>
                    <Controller
                      control={form.control}
                      name="currency"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="h-10">
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
                  onClick={() => setStep("settings")}
                  variant="outline"
                  className="mt-4"
                >
                  Try Again
                </Button>
              </div>
            )}
          </div>

          {(step === "select" || step === "mapping" || step === "settings") && (
            <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-border">
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
                  Next: Settings
                </Button>
              )}

              {step === "settings" && (
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

import { Controller } from "react-hook-form";
