"use client";

import * as React from "react";
import { cn } from "@workspace/ui";
import { FileText } from "lucide-react";
import { type VaultFile } from "@workspace/modules/vault/vault.action";
import { formatBytes } from "@workspace/utils";

interface VaultItemListProps {
  files: VaultFile[];
  selectedFileId?: string;
  onSelect: (file: VaultFile) => void;
  dictionary: any;
}

export function VaultItemList({
  files,
  selectedFileId,
  onSelect,
  dictionary,
}: VaultItemListProps) {
  const t = dictionary.vault;

  return (
    <div className="min-w-full">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground uppercase h-10">
            <th className="px-4 text-left font-medium">{t.columns.filename}</th>
            <th className="px-4 text-left font-medium">{t.columns.format}</th>
            <th className="px-4 text-right font-medium">{t.columns.size}</th>
            <th className="px-4 text-right font-medium">{t.columns.date}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {files.map((file: VaultFile) => (
            <tr
              key={file.id}
              className={cn(
                "h-14 cursor-pointer transition-colors hover:bg-muted/50",
                selectedFileId === file.id && "bg-primary/5",
              )}
              onClick={() => onSelect(file)}
            >
              <td className="px-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 border bg-muted flex items-center justify-center shrink-0">
                    {file.type.startsWith("image/") ? (
                      <img
                        src={file.url}
                        className="w-full h-full object-cover"
                        alt={file.name}
                      />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <span className="font-medium truncate max-w-[200px]">
                    {file.name}
                  </span>
                </div>
              </td>
              <td className="px-4 text-primary font-medium">{file.type}</td>
              <td className="px-4 text-right tabular-nums">
                {formatBytes(file.size)}
              </td>
              <td className="px-4 text-right text-muted-foreground">
                {new Date(file.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
