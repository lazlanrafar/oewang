"use client";

import * as React from "react";
import { cn } from "@workspace/ui";
import { FileText } from "lucide-react";
import { type VaultFile } from "@workspace/modules/vault/vault.action";

interface VaultItemCardProps {
  file: VaultFile;
  isSelected: boolean;
  onSelect: (file: VaultFile) => void;
}

export function VaultItemCard({
  file,
  isSelected,
  onSelect,
}: VaultItemCardProps) {
  return (
    <div
      className={cn(
        "group relative aspect-square border overflow-hidden cursor-pointer transition-all hover:ring-1 hover:ring-primary/20",
        isSelected
          ? "border-primary ring-2 ring-primary/20 bg-primary/5"
          : "border-transparent hover:border-muted-foreground/30",
      )}
      onClick={() => onSelect(file)}
    >
      <div className="w-full h-full bg-muted flex items-center justify-center">
        {file.type.startsWith("image/") ? (
          <img
            src={file.url}
            alt={file.name}
            className="object-cover w-full h-full"
          />
        ) : (
          <FileText className="h-12 w-12 text-muted-foreground" />
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-linear-to-t from-black/60 to-transparent">
        <p className="text-[10px] text-white font-medium truncate">
          {file.name}
        </p>
      </div>
    </div>
  );
}
