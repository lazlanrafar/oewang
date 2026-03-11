"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Button,
  ScrollArea,
} from "@workspace/ui";
import {
  Download,
  ExternalLink,
  X,
  FileText,
  File,
  Image as ImageIcon,
  Film,
} from "lucide-react";

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

export function FilePreviewSheet({
  open,
  onOpenChange,
  file,
}: FilePreviewSheetProps) {
  if (!file) return null;

  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  const isVideo = file.type.startsWith("video/");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader className="pb-6 border-b shrink-0 flex flex-row items-center justify-between space-y-0">
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <SheetTitle className="text-sm font-medium truncate pr-4">
              {file.name}
            </SheetTitle>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 w-full bg-muted/5">
          <div className="flex items-center justify-center min-h-[calc(100vh-100px)]">
            {isImage ? (
              <img
                src={file.url}
                alt={file.name}
                className="max-w-full h-auto rounded-lg shadow-sm border animate-in fade-in zoom-in duration-300"
              />
            ) : isPdf ? (
              <iframe
                src={`${file.url}#toolbar=0`}
                className="w-full h-[calc(100vh-180px)] rounded-lg border shadow-sm bg-background animate-in fade-in duration-500"
                title={file.name}
              />
            ) : isVideo ? (
              <video
                src={file.url}
                controls
                className="max-w-full rounded-lg shadow-sm border animate-in fade-in duration-300"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="p-8 rounded-full bg-muted/30">
                  <File className="h-16 w-16" />
                </div>
                <p className="text-sm font-medium">
                  Preview not available for this file type
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(file.url, "_blank")}
                >
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
