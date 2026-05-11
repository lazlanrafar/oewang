"use client";

import Image from "next/image";

import type { Dictionary } from "@workspace/dictionaries";
import type { VaultFile } from "@workspace/modules/vault/vault.action";
import { cn } from "@workspace/ui";
import { FileText } from "lucide-react";

interface VaultItemCardProps {
  file: VaultFile;
  isSelected: boolean;
  onSelect: (file: VaultFile) => void;
  dictionary: Dictionary;
}

export function VaultItemCard({ file, isSelected, onSelect }: VaultItemCardProps) {
  return (
    <button
      type="button"
      className={cn(
        "group relative aspect-square cursor-pointer overflow-hidden border transition-all hover:ring-1 hover:ring-primary/20",
        isSelected
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-transparent hover:border-muted-foreground/30",
      )}
      onClick={() => onSelect(file)}
    >
      <div className="flex h-full w-full items-center justify-center bg-muted">
        {file.type.startsWith("image/") ? (
          <div className="relative h-full w-full">
            <Image src={file.url} alt={file.name} fill unoptimized sizes="256px" className="object-cover" />
          </div>
        ) : (
          <FileText className="h-12 w-12 text-muted-foreground" />
        )}
      </div>
      <div className="absolute right-0 bottom-0 left-0 bg-linear-to-t from-black/60 to-transparent p-2">
        <p className="truncate font-medium text-[10px] text-white">{file.name}</p>
      </div>
    </button>
  );
}
