"use client";

import Image from "next/image";

import type { Dictionary } from "@workspace/dictionaries";
import type { VaultFile } from "@workspace/modules/vault/vault.action";
import { cn } from "@workspace/ui";
import { formatBytes } from "@workspace/utils";
import { FileText } from "lucide-react";

interface VaultItemListProps {
  files: VaultFile[];
  selectedFileId?: string;
  onSelect: (file: VaultFile) => void;
  dictionary: Dictionary;
}

export function VaultItemList({ files, selectedFileId, onSelect, dictionary }: VaultItemListProps) {
  const t = dictionary.vault;

  return (
    <div className="min-w-full">
      <table className="w-full text-sm">
        <thead>
          <tr className="h-10 border-b text-muted-foreground text-xs uppercase">
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
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center border bg-muted">
                    {file.type.startsWith("image/") ? (
                      <div className="relative h-full w-full">
                        <Image src={file.url} alt={file.name} fill unoptimized sizes="40px" className="object-cover" />
                      </div>
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <span className="max-w-[200px] truncate font-medium">{file.name}</span>
                </div>
              </td>
              <td className="px-4 font-medium text-primary">{file.type}</td>
              <td className="px-4 text-right tabular-nums">{formatBytes(file.size)}</td>
              <td className="px-4 text-right text-muted-foreground">{new Date(file.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
