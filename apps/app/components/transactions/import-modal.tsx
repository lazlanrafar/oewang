"use client";

import { useCallback, useRef, useState } from "react";

import { Button, cn, Dialog, DialogContent, DialogHeader, DialogTitle } from "@workspace/ui";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Upload, X } from "lucide-react";

import { importTransactions } from "@workspace/modules";

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type State =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "success"; imported: number; skipped: number }
  | { status: "error"; message: string };

const ACCEPTED = [
  "image/*",
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  ".xlsx",
  ".xls",
  ".csv",
  ".txt",
].join(",");

function formatAccepted() {
  return "Images, PDF, CSV, Excel, plain text";
}

export function ImportModal({ open, onOpenChange, onSuccess }: ImportModalProps) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setState({ status: "idle" });
    setDragOver(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const processFile = useCallback(
    async (file: File) => {
      setState({ status: "uploading" });
      const formData = new FormData();
      formData.append("file", file);

      const result = await importTransactions(formData);
      if (result.success && result.data) {
        setState({
          status: "success",
          imported: result.data.imported,
          skipped: result.data.skipped,
        });
        onSuccess();
      } else {
        setState({
          status: "error",
          message: result.error ?? "Unknown error",
        });
      }
    },
    [onSuccess],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Import Transactions
          </DialogTitle>
        </DialogHeader>

        {state.status === "idle" && (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                "flex flex-col items-center justify-center gap-3 p-10 border-2 border-dashed rounded-xl cursor-pointer transition-colors",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
              )}
            >
              <FileUp className="w-10 h-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium text-sm">Drop a file or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">{formatAccepted()}</p>
              </div>
            </div>
            <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleFileChange} />
            <p className="text-xs text-center text-muted-foreground">
              AI will extract transactions from your file and import them automatically.
            </p>
          </>
        )}

        {state.status === "uploading" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium text-sm">Analysing with AI…</p>
              <p className="text-xs text-muted-foreground mt-1">This may take a few seconds</p>
            </div>
          </div>
        )}

        {state.status === "success" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <div className="text-center">
              <p className="font-semibold text-base">Import complete</p>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-medium text-foreground">{state.imported}</span> transaction
                {state.imported !== 1 ? "s" : ""} imported
                {state.skipped > 0 && (
                  <>
                    , <span className="font-medium">{state.skipped}</span> skipped
                  </>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                Import another
              </Button>
              <Button size="sm" onClick={() => handleClose(false)}>
                Done
              </Button>
            </div>
          </div>
        )}

        {state.status === "error" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <div className="text-center">
              <p className="font-semibold text-base">Import failed</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[300px]">{state.message}</p>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>
              Try again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
