"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { getImportJobStatus, startTransactionsImport } from "@workspace/modules/import/import.action";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@workspace/ui";
import { AlertCircle, CheckCircle2, FileUp, Loader2 } from "lucide-react";

interface ImportAiModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  dictionary: Dictionary;
}

// AI bank-statement import: upload one file, apps/api enqueues it onto the
// Go worker (apps/worker) and returns a jobId immediately, then this modal
// polls GET /transactions/import/:jobId until the job settles. Mirrors the
// polling pattern already used by connect-telegram.tsx (refetchInterval
// while a dialog is open, a side effect watching the polled data for a
// terminal state).
export function ImportAiModal({ open, onOpenChange, onSuccess, dictionary }: ImportAiModalProps) {
  const [step, setStep] = useState<"select" | "uploading" | "processing" | "success" | "error">("select");
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  const isPolling = step === "processing" && Boolean(jobId);

  const { data: jobStatus } = useQuery({
    queryKey: ["transactions", "import-job", jobId],
    enabled: isPolling,
    refetchInterval: isPolling ? 2000 : false,
    queryFn: async () => {
      if (!jobId) return null;
      const res = await getImportJobStatus(jobId);
      return res.success ? res.data : null;
    },
  });

  useEffect(() => {
    if (!jobStatus || step !== "processing") return;
    if (jobStatus.status === "succeeded") {
      setResult({ imported: jobStatus.imported ?? 0, skipped: jobStatus.skipped ?? 0 });
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onSuccess();
      router.refresh();
    } else if (jobStatus.status === "failed") {
      setErrorMessage(jobStatus.error || dictionary.transactions.import_statement_failed);
      setStep("error");
    }
  }, [jobStatus, step, queryClient, onSuccess, router, dictionary.transactions.import_statement_failed]);

  const handleClose = (v: boolean) => {
    if (!v) {
      setStep("select");
      setJobId(null);
      setResult(null);
      setErrorMessage("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    onOpenChange(v);
  };

  const handleFileSelected = async (file: File) => {
    setStep("uploading");
    const formData = new FormData();
    formData.append("file", file);

    const res = await startTransactionsImport(formData);
    if (res.success && res.data) {
      setJobId(res.data.jobId);
      setStep("processing");
    } else {
      setErrorMessage(res.error || dictionary.transactions.import_statement_failed);
      setStep("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{dictionary.transactions.import_statement_ai}</DialogTitle>
          {step === "select" && (
            <DialogDescription>{dictionary.transactions.import_statement_select_file}</DialogDescription>
          )}
        </DialogHeader>

        {step === "select" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
            />
            <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
              <FileUp className="h-4 w-4" />
              {dictionary.transactions.import_statement_ai}
            </Button>
          </div>
        )}

        {(step === "uploading" || step === "processing") && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-medium text-sm">
              {step === "uploading"
                ? dictionary.transactions.import_statement_uploading
                : dictionary.transactions.import_statement_processing}
            </p>
          </div>
        )}

        {step === "success" && result && (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-muted-foreground text-sm">
              {`Successfully imported ${result.imported} transaction(s).`}
              {result.skipped > 0 ? ` ${result.skipped} row(s) skipped.` : ""}
            </p>
            <Button onClick={() => handleClose(false)} className="mt-2">
              {dictionary.common.close}
            </Button>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <p className="max-w-[300px] text-muted-foreground text-sm">{errorMessage}</p>
            <Button onClick={() => setStep("select")} variant="outline" className="mt-2">
              {dictionary.common.cancel}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
