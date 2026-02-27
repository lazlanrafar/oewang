"use client";

import { useEffect, useState } from "react";

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@workspace/ui";
import { Check, File, FileText, Film, Image, Paperclip } from "lucide-react";

import { getVaultFiles } from "@workspace/modules";

interface VaultFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

interface VaultPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith("image/")) return <Image className="w-4 h-4 shrink-0" />;
  if (type.startsWith("video/")) return <Film className="w-4 h-4 shrink-0" />;
  if (type === "application/pdf") return <FileText className="w-4 h-4 shrink-0" />;
  return <File className="w-4 h-4 shrink-0" />;
}

export function VaultPickerModal({ open, onOpenChange, selectedIds, onConfirm }: VaultPickerModalProps) {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set(selectedIds));
  const [isLoading, setIsLoading] = useState(false);

  // Sync pending selection when parent selectedIds change (e.g. edit mode)
  useEffect(() => {
    setPending(new Set(selectedIds));
  }, [selectedIds.join(",")]);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    getVaultFiles()
      .then((res) => {
        if (res?.success && res.data?.files) setFiles(res.data.files);
      })
      .finally(() => setIsLoading(false));
  }, [open]);

  const toggle = (id: string) => {
    setPending((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="w-4 h-4" />
            Attach Vault Files
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading vault…</p>}
          {!isLoading && files.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No vault files found. Upload files in the Vault section first.
            </p>
          )}
          {!isLoading &&
            files.map((file) => {
              const selected = pending.has(file.id);
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => toggle(file.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-muted/50 mb-1 ${
                    selected ? "bg-primary/10 text-primary" : ""
                  }`}
                >
                  <FileIcon type={file.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                  {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
        </div>

        <div className="flex justify-between items-center pt-4 border-t shrink-0">
          <span className="text-sm text-muted-foreground">
            {pending.size} file{pending.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onConfirm(Array.from(pending));
                onOpenChange(false);
              }}
            >
              Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
