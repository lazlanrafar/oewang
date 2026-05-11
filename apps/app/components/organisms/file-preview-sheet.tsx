"use client";

import Image from "next/image";

import { Button, ScrollArea, Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui";
import { Download, ExternalLink, File, X } from "lucide-react";

interface FilePreview {
  id: string;
  name: string;
  type: string;
  url: string;
}

interface FilePreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FilePreview | null;
}

export function FilePreviewSheet({ open, onOpenChange, file }: FilePreviewSheetProps) {
  if (!file) return null;

  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  const isVideo = file.type.startsWith("video/");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 border-b pb-6">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <SheetTitle className="truncate pr-4 font-medium text-sm">{file.name}</SheetTitle>
            <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
              {file.type.split("/")[1] || file.type}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => window.open(file.url, "_blank")}
              title="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => {
                const link = document.createElement("a");
                link.href = file.url;
                link.download = file.name;
                link.click();
              }}
              title="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="w-full flex-1 bg-muted/5">
          <div className="flex min-h-[calc(100vh-100px)] items-center justify-center">
            {isImage ? (
              <Image
                src={file.url}
                alt={file.name}
                width={800}
                height={600}
                className="fade-in zoom-in h-auto max-w-full animate-in rounded-lg border shadow-sm duration-300"
                unoptimized
              />
            ) : isPdf ? (
              <iframe
                src={`${file.url}#toolbar=0`}
                className="fade-in h-[calc(100vh-180px)] w-full animate-in rounded-lg border bg-background shadow-sm duration-500"
                title={file.name}
              />
            ) : isVideo ? (
              <video
                src={file.url}
                controls
                className="fade-in max-w-full animate-in rounded-lg border shadow-sm duration-300"
              >
                <track kind="captions" />
              </video>
            ) : (
              <div className="fade-in slide-in-from-bottom-4 flex animate-in flex-col items-center justify-center gap-4 text-muted-foreground duration-500">
                <div className="rounded-full bg-muted/30 p-8">
                  <File className="h-16 w-16" />
                </div>
                <p className="font-medium text-sm">Preview not available for this file type</p>
                <Button variant="outline" size="sm" onClick={() => window.open(file.url, "_blank")}>
                  Open Original File
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
