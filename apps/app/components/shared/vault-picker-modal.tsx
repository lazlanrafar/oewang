"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  ScrollArea,
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
  Paperclip,
  Search,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import {
  getVaultFiles,
  uploadVaultFile,
} from "@workspace/modules/vault/vault.action";

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

interface VaultFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string; // added url for image preview
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
  if (type.startsWith("image/"))
    return <ImageIcon className="w-4 h-4 shrink-0" />;
  if (type.startsWith("video/")) return <Film className="w-4 h-4 shrink-0" />;
  if (type === "application/pdf")
    return <FileText className="w-4 h-4 shrink-0" />;
  return <FileIconLucide className="w-4 h-4 shrink-0" />;
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
  const [view, setView] = useState<"list" | "grid">("list");
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
  }, [selectedIds.join(",")]);

  const loadFiles = () => {
    setIsLoading(true);
    getVaultFiles(page, LIMIT)
      .then((res) => {
        if (res?.success && res.data) {
          setFiles(res.data.files);
          setTotalPages(res.data.pagination.total_pages);
        }
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    loadFiles();
  }, [open, page]);

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
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["vault-files"] });

      // Auto-select the newly uploaded file and append it locally without reloading immediately
      setFiles((prev) => [data, ...prev]);
      setPending((prev) => new Set(prev).add(data.id));
    },
    onError: (error: any) => {
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
    } catch (error) {
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
      <DialogContent className="sm:max-w-[900px] max-h-[70vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center  py-4 border-b sr-only">
          <DialogTitle>Select file</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4  pt-6 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                className="pl-9 h-10 w-full rounded-lg bg-transparent"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="hidden sm:flex">
                    <ArrowUpDown className="w-4 h-4 mr-2" />
                    Sort
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortBy("newest")}>
                    Newest first{" "}
                    {sortBy === "newest" && (
                      <Check className="w-4 h-4 ml-auto" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("name_asc")}>
                    Name (A-Z){" "}
                    {sortBy === "name_asc" && (
                      <Check className="w-4 h-4 ml-auto" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("name_desc")}>
                    Name (Z-A){" "}
                    {sortBy === "name_desc" && (
                      <Check className="w-4 h-4 ml-auto" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("size_desc")}>
                    Size (Largest){" "}
                    {sortBy === "size_desc" && (
                      <Check className="w-4 h-4 ml-auto" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("size_asc")}>
                    Size (Smallest){" "}
                    {sortBy === "size_asc" && (
                      <Check className="w-4 h-4 ml-auto" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 rounded-lg px-3">
                    {view === "list" ? (
                      <>
                        <ListIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                        List view
                      </>
                    ) : (
                      <>
                        <Grid className="w-4 h-4 mr-2 text-muted-foreground" />
                        Grid view
                      </>
                    )}
                    <ChevronDown className="w-4 h-4 ml-2 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onClick={() => setView("list")}
                    className="justify-between"
                  >
                    <span className="flex items-center">
                      <ListIcon className="w-4 h-4 mr-2 text-muted-foreground" />{" "}
                      List view
                    </span>
                    {view === "list" && <Check className="w-4 h-4" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setView("grid")}
                    className="justify-between"
                  >
                    <span className="flex items-center">
                      <Grid className="w-4 h-4 mr-2 text-muted-foreground" />{" "}
                      Grid view
                    </span>
                    {view === "grid" && <Check className="w-4 h-4" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {filterType === "all"
                    ? "File type"
                    : filterType.charAt(0).toUpperCase() +
                      filterType.slice(1)}{" "}
                  <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setFilterType("all")}>
                  All types{" "}
                  {filterType === "all" && (
                    <Check className="w-4 h-4 ml-auto" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType("image")}>
                  Images{" "}
                  {filterType === "image" && (
                    <Check className="w-4 h-4 ml-auto" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType("document")}>
                  Documents{" "}
                  {filterType === "document" && (
                    <Check className="w-4 h-4 ml-auto" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType("video")}>
                  Videos{" "}
                  {filterType === "video" && (
                    <Check className="w-4 h-4 ml-auto" />
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
                  <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setFilterSize("all")}>
                  Any size{" "}
                  {filterSize === "all" && (
                    <Check className="w-4 h-4 ml-auto" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterSize("small")}>
                  Under 1MB{" "}
                  {filterSize === "small" && (
                    <Check className="w-4 h-4 ml-auto" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterSize("medium")}>
                  1MB - 5MB{" "}
                  {filterSize === "medium" && (
                    <Check className="w-4 h-4 ml-auto" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterSize("large")}>
                  Over 5MB{" "}
                  {filterSize === "large" && (
                    <Check className="w-4 h-4 ml-auto" />
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div
            className="border border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center gap-2 transition-colors hover:bg-muted/50 py-10"
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
              Add media <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
            <p className="text-sm text-muted-foreground">
              Drag and drop images, videos, 3D models, and files
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading vault…
            </p>
          )}
          {!isLoading && files.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
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
                        className="flex items-center gap-4 py-3 px-2 border-b hover:bg-muted/30 transition-colors group"
                      >
                        <div className="flex items-center shrink-0">
                          <button
                            type="button"
                            onClick={() => toggle(file.id)}
                            className={cn(
                              "w-5 h-5 rounded border flex items-center justify-center transition-colors shadow-sm cursor-pointer",
                              selected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "bg-background border-input hover:border-foreground",
                            )}
                          >
                            {selected && (
                              <Check className="w-3.5 h-3.5" strokeWidth={3} />
                            )}
                          </button>
                        </div>
                        <div className="w-10 h-10 rounded shrink-0 overflow-hidden bg-muted flex items-center justify-center border">
                          {file.type.startsWith("image/") && file.url ? (
                            <img
                              src={file.url}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <FileIcon type={file.type} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex-1 truncate pr-4">
                            <p
                              className="text-sm font-medium truncate cursor-pointer"
                              onClick={() => toggle(file.id)}
                            >
                              {file.name}
                            </p>
                          </div>

                          <div className="flex items-center justify-between sm:justify-start gap-4 sm:gap-8 text-sm text-muted-foreground w-full sm:w-[320px] shrink-0">
                            <span className="w-16 truncate uppercase text-xs font-semibold">
                              {file.type.split("/")[1] || file.type}
                            </span>
                            <span className="w-24 truncate">
                              {(file as any).metadata?.orientation ||
                                "Landscape"}
                            </span>
                            <span className="w-20 text-right truncate">
                              {formatBytes(file.size)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                  {processedFiles.map((file) => {
                    const selected = pending.has(file.id);
                    return (
                      <div
                        key={file.id}
                        className="group relative flex flex-col gap-2 rounded-xl bg-muted/20 pb-3"
                      >
                        <div
                          className="w-full aspect-square bg-muted rounded-t-xl rounded-b-md overflow-hidden relative cursor-pointer border"
                          onClick={() => toggle(file.id)}
                        >
                          {file.type.startsWith("image/") && file.url ? (
                            <img
                              src={file.url}
                              alt={file.name}
                              className="object-cover w-full h-full transition-transform group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
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
                                "w-5 h-5 rounded border shadow-sm flex items-center justify-center transition-all",
                                selected
                                  ? "bg-primary border-primary text-primary-foreground opacity-100"
                                  : "bg-background/80 border-input opacity-0 group-hover:opacity-100 backdrop-blur-sm",
                              )}
                            >
                              {selected && (
                                <Check className="w-3 h-3" strokeWidth={3} />
                              )}
                            </button>
                          </div>

                          {/* Dark gradient overlay at bottom of image if selected, to match reference somewhat but not required since names are outside now */}
                        </div>

                        <div className="px-3 flex flex-col text-center">
                          <span
                            className="text-sm font-medium truncate"
                            title={file.name}
                          >
                            {file.name}
                          </span>
                          <span className="text-xs text-muted-foreground uppercase mt-0.5">
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
        <div className="flex flex-col sm:flex-row justify-between items-center  py-4 border-t shrink-0 gap-4 mt-auto">
          <div className="flex items-center w-full sm:w-auto justify-between sm:justify-start">
            <Button
              variant="link"
              className="text-primary p-0 h-auto font-medium"
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
                <span className="text-xs px-2">
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
          <div className="flex gap-2 w-full sm:w-auto ml-auto">
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
