"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getVaultFiles,
  uploadVaultFile,
  type VaultFile,
} from "@workspace/modules/vault/vault.action";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@workspace/ui";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  File as FileIconLucide,
  FileText,
  Film,
  Grid,
  Image as ImageIcon,
  List as ListIcon,
  Search,
} from "lucide-react";
import { toast } from "sonner";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];

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
  if (type.startsWith("image/"))
    return <ImageIcon className="h-4 w-4 shrink-0" />;
  if (type.startsWith("video/")) return <Film className="h-4 w-4 shrink-0" />;
  if (type === "application/pdf")
    return <FileText className="h-4 w-4 shrink-0" />;
  return <FileIconLucide className="h-4 w-4 shrink-0" />;
}

function getFileOrientation(metadata: VaultFile["metadata"]) {
  if (!metadata) return "Landscape";

  try {
    const parsed = JSON.parse(metadata) as { orientation?: string };
    return parsed.orientation || "Landscape";
  } catch {
    return "Landscape";
  }
}

export function VaultPickerModal({
  open,
  onOpenChange,
  selectedIds,
  onConfirm,
}: VaultPickerModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set(selectedIds));
  const [isLoading, setIsLoading] = useState(false);

  // New State additions
  const [view, setView] = useState<"list" | "grid">("grid");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSize, setFilterSize] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const LIMIT = 12;

  const processedFiles = useMemo(() => {
    let result = Array.isArray(files) ? [...files] : [];

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    }

    // Type Filter
    if (filterType !== "all") {
      result = result.filter((f) => {
        if (filterType === "image") return f.type.startsWith("image/");
        if (filterType === "document")
          return (
            f.type.includes("pdf") ||
            f.type.includes("excel") ||
            f.type.includes("spreadsheet") ||
            f.type.includes("csv")
          );
        if (filterType === "video") return f.type.startsWith("video/");
        return true;
      });
    }

    // Size Filter
    if (filterSize !== "all") {
      result = result.filter((f) => {
        const mb = f.size / (1024 * 1024);
        if (filterSize === "small") return mb < 1;
        if (filterSize === "medium") return mb >= 1 && mb <= 5;
        if (filterSize === "large") return mb > 5;
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      if (sortBy === "size_asc") return a.size - b.size;
      if (sortBy === "size_desc") return b.size - a.size;
      return 0; // "newest" defaults to original fetch order
    });

    return result;
  }, [files, search, filterType, filterSize, sortBy]);

  // Sync pending selection when parent selectedIds change (e.g. edit mode)
  useEffect(() => {
    setPending(new Set(selectedIds));
  }, [selectedIds]);

  const loadFiles = useCallback(() => {
    setIsLoading(true);
    getVaultFiles(page, LIMIT)
      .then((res) => {
        if (res.success && res.data) {
          setFiles(res.data.files);
          setTotalPages(res.data?.pagination?.total_pages);
        }
      })
      .finally(() => setIsLoading(false));
  }, [page]);

  useEffect(() => {
    if (!open) return;
    loadFiles();
  }, [open, loadFiles]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error(
          `Invalid file type for ${file.name}. Only documents and images are allowed.`,
        );
      }
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadVaultFile(formData);
      if (result.success) return result.data;
      throw new Error(result.error);
    },
    onSuccess: (data: VaultFile) => {
      queryClient.invalidateQueries({ queryKey: ["vault-files"] });

      // Auto-select the newly uploaded file and append it locally without reloading immediately
      setFiles((prev) => [data, ...prev]);
      setPending((prev) => new Set(prev).add(data.id));
    },
    onError: (error: Error) => {
      toast.error(error.message || "Upload failed");
    },
  });

  const handleUploadFiles = async (selectedFiles: FileList | File[]) => {
    const filesArray = Array.from(selectedFiles);
    if (filesArray.length === 0) return;

    const toastId = toast.loading(`Uploading ${filesArray.length} file(s)...`);

    try {
      await Promise.all(
        filesArray.map((file) => uploadMutation.mutateAsync(file)),
      );
      toast.success("All files uploaded successfully", { id: toastId });
    } catch (_error) {
      toast.error("Some files failed to upload", { id: toastId });
    }
  };

  const toggle = (id: string) => {
    setPending((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[900px]">
        <DialogHeader className="sr-only flex flex-row items-center border-b py-4">
          <DialogTitle>Select file</DialogTitle>
        </DialogHeader>

        <div className="flex shrink-0 flex-col gap-4 pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                className="h-8 w-full bg-transparent pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="hidden sm:flex h-8">
                    <ArrowUpDown className="mr-2 h-4 w-4" />
                    Sort
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortBy("newest")}>
                    Newest first{" "}
                    {sortBy === "newest" && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("name_asc")}>
                    Name (A-Z){" "}
                    {sortBy === "name_asc" && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("name_desc")}>
                    Name (Z-A){" "}
                    {sortBy === "name_desc" && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("size_desc")}>
                    Size (Largest){" "}
                    {sortBy === "size_desc" && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("size_asc")}>
                    Size (Smallest){" "}
                    {sortBy === "size_asc" && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-8 px-3">
                    {view === "list" ? (
                      <>
                        <ListIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                        List view
                      </>
                    ) : (
                      <>
                        <Grid className="mr-2 h-4 w-4 text-muted-foreground" />
                        Grid view
                      </>
                    )}
                    <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onClick={() => setView("list")}
                    className="justify-between"
                  >
                    <span className="flex items-center">
                      <ListIcon className="mr-2 h-4 w-4 text-muted-foreground" />{" "}
                      List view
                    </span>
                    {view === "list" && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setView("grid")}
                    className="justify-between"
                  >
                    <span className="flex items-center">
                      <Grid className="mr-2 h-4 w-4 text-muted-foreground" />{" "}
                      Grid view
                    </span>
                    {view === "grid" && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {filterType === "all"
                    ? "File type"
                    : filterType.charAt(0).toUpperCase() +
                      filterType.slice(1)}{" "}
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setFilterType("all")}>
                  All types{" "}
                  {filterType === "all" && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType("image")}>
                  Images{" "}
                  {filterType === "image" && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType("document")}>
                  Documents{" "}
                  {filterType === "document" && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType("video")}>
                  Videos{" "}
                  {filterType === "video" && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {filterSize === "all"
                    ? "File size"
                    : filterSize === "small"
                      ? "< 1MB"
                      : filterSize === "medium"
                        ? "1-5MB"
                        : "> 5MB"}{" "}
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setFilterSize("all")}>
                  Any size{" "}
                  {filterSize === "all" && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterSize("small")}>
                  Under 1MB{" "}
                  {filterSize === "small" && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterSize("medium")}>
                  1MB - 5MB{" "}
                  {filterSize === "medium" && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterSize("large")}>
                  Over 5MB{" "}
                  {filterSize === "large" && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* biome-ignore lint/a11y/noStaticElementInteractions: Dropzone area */}
          <div
            className="flex flex-col items-center justify-center gap-2 border border-dashed p-8 py-10 text-center transition-colors hover:bg-muted/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files) handleUploadFiles(e.dataTransfer.files);
            }}
          >
            <input
              type="file"
              multiple
              accept={ALLOWED_TYPES.join(",")}
              className="hidden"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files) handleUploadFiles(e.target.files);
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              Add media <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
            <p className="text-muted-foreground text-sm">
              Drag and drop images, videos, 3D models, and files
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && (
            <p className="py-8 text-center text-muted-foreground text-sm">
              Loading vault…
            </p>
          )}
          {!isLoading && files.length === 0 && (
            <p className="py-8 text-center text-muted-foreground text-sm">
              No vault files found. Upload files in the Vault section first.
            </p>
          )}
          {!isLoading && files.length > 0 && (
            <div className="p-4">
              {view === "list" ? (
                <div className="flex flex-col gap-0 border-t">
                  {processedFiles.map((file) => {
                    const selected = pending.has(file.id);
                    return (
                      <div
                        key={file.id}
                        className="group flex items-center gap-4 border-b px-2 py-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex shrink-0 items-center">
                          <button
                            type="button"
                            onClick={() => toggle(file.id)}
                            className={cn(
                              "flex h-5 w-5 cursor-pointer items-center justify-center border shadow-sm transition-colors",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input bg-background hover:border-foreground",
                            )}
                          >
                            {selected && (
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            )}
                          </button>
                        </div>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border bg-muted">
                          {file.type.startsWith("image/") && file.url ? (
                            <>
                              {/* biome-ignore lint/performance/noImgElement: external url */}
                              <img
                                src={file.url}
                                alt={file.name}
                                className="h-full w-full object-cover"
                              />
                            </>
                          ) : (
                            <FileIcon type={file.type} />
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 sm:flex-row sm:items-center">
                          <div className="flex-1 truncate pr-4">
                            {/* biome-ignore lint/a11y/useKeyWithClickEvents: non-critical file toggle */}
                            <p
                              className="cursor-pointer truncate font-medium text-sm"
                              onClick={() => toggle(file.id)}
                            >
                              {file.name}
                            </p>
                          </div>

                          <div className="flex w-full shrink-0 items-center justify-between gap-4 text-muted-foreground text-sm sm:w-[320px] sm:justify-start sm:gap-8">
                            <span className="w-16 truncate font-semibold text-xs uppercase">
                              {file.type.split("/")[1] || file.type}
                            </span>
                            <span className="w-24 truncate">
                              {getFileOrientation(file.metadata)}
                            </span>
                            <span className="w-20 truncate text-right">
                              {formatBytes(file.size)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 xs:grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
                  {processedFiles.map((file) => {
                    const selected = pending.has(file.id);
                    return (
                      <div
                        key={file.id}
                        className="group relative flex flex-col gap-2 bg-muted/20 pb-3"
                      >
                        {/* biome-ignore lint/a11y/noStaticElementInteractions: parent container click */}
                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: parent container click */}
                        <div
                          className="relative aspect-square w-full cursor-pointer overflow-hidden border bg-muted"
                          onClick={() => toggle(file.id)}
                        >
                          {file.type.startsWith("image/") && file.url ? (
                            <>
                              {/* biome-ignore lint/performance/noImgElement: external url */}
                              <img
                                src={file.url}
                                alt={file.name}
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              />
                            </>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <FileIcon type={file.type} />
                            </div>
                          )}

                          <div className="absolute top-2 left-2 z-10 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(file.id);
                              }}
                              className={cn(
                                "flex h-5 w-5 items-center justify-center border shadow-sm transition-all",
                                selected
                                  ? "border-primary bg-primary text-primary-foreground opacity-100"
                                  : "border-input bg-background/80 opacity-0 backdrop-blur-sm group-hover:opacity-100",
                              )}
                            >
                              {selected && (
                                <Check className="h-3 w-3" strokeWidth={3} />
                              )}
                            </button>
                          </div>

                          {/* Dark gradient overlay at bottom of image if selected, to match reference somewhat but not required since names are outside now */}
                        </div>

                        <div className="flex flex-col px-3 text-center">
                          <span
                            className="truncate font-medium text-sm"
                            title={file.name}
                          >
                            {file.name}
                          </span>
                          <span className="mt-0.5 text-muted-foreground text-xs uppercase">
                            {file.type.split("/")[1] || file.type}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pagination & Footer Controls */}
        <div className="mt-auto flex shrink-0 flex-col items-center justify-between gap-4 border-t py-4 sm:flex-row">
          <div className="flex w-full items-center justify-between sm:w-auto sm:justify-start">
            <Button
              variant="link"
              className="h-auto p-0 font-medium text-primary"
              onClick={() => setPending(new Set())}
            >
              Clear selection
            </Button>

            {/* We keep pagination hidden logically unless files > limit, but Shopify reference hides pagination in this drawer context. We leave it invisible if totalPages=1. */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-xs">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="ml-auto flex w-full gap-2 sm:w-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onConfirm(Array.from(pending));
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
