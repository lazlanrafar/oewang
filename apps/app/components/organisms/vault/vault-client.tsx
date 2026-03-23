"use client";

import * as React from "react";

import { useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Progress,
  ScrollArea,
  Separator,
  Skeleton,
} from "@workspace/ui";
import { useAppStore } from "@/stores/app";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Filter,
  Grid,
  List as ListIcon,
  MoreVertical,
  Plus,
  Search,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteVaultFile,
  getVaultFiles,
  updateVaultFileTags,
  uploadVaultFile,
} from "@workspace/modules/vault/vault.action";
import { type VaultFile, type PaginatedVaultFiles } from "@workspace/modules/vault/vault.action";

import { useQueryState, parseAsString, parseAsInteger } from "nuqs";
import { formatBytes } from "@workspace/utils";
import {
  VaultSkeletonLoading,
  VaultContentSkeleton,
  VaultDetailSkeleton,
} from "./vault-skeleton-loading";
import { VaultItemCard } from "./vault-item-card";
import { VaultItemList } from "./vault-item-list";

// ... inside VaultClient component ...
// Remove the top-level loading check from lines 218-220

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

const SUGGESTED_TAGS = [
  "Invoice",
  "Transaction",
  "Receipt",
  "Report",
  "Contract",
  "Document",
];

export function VaultClient() {
  const queryClient = useQueryClient();
  const [view, setView] = useQueryState(
    "view",
    parseAsString.withDefault("list").withOptions({ shallow: true }),
  );
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withDefault("").withOptions({ shallow: true }),
  );

  const [isDragging, setIsDragging] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<VaultFile | null>(
    null,
  );
  const [tagInput, setTagInput] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<any>(null);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const limit = 15;

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isRefetching,
  } = useInfiniteQuery<PaginatedVaultFiles, Error>({
    queryKey: ["vault-files", search],
    queryFn: async ({ pageParam }) => {
      const result = await getVaultFiles(pageParam as number, limit, search || undefined);
      if (result.success) return result.data;
      throw new Error(result.error);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: any) => {
      const current = lastPage.pagination.page;
      const total = lastPage.pagination.total_pages;
      return current < total ? current + 1 : undefined;
    },
  });

  const files = React.useMemo(() => {
    return data?.pages.flatMap((page) => page.files) || [];
  }, [data]);

  const pagination = data?.pages[0]?.pagination;

  // Intersection Observer for Infinite Scroll
  React.useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, root: scrollRef.current },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["vault-files"] });
      queryClient.invalidateQueries({ queryKey: ["workspace", "active"] });
      setSelectedFile(data);
    },
    onError: (error: any) => {
      toast.error(error.message || "Upload failed");
    },
  });

  const tagsMutation = useMutation({
    mutationFn: async ({ id, tags }: { id: string; tags: string[] }) => {
      const result = await updateVaultFileTags(id, tags);
      if (result.success) return result.data;
      throw new Error(result.error);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["vault-files"] });
      setSelectedFile(data);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update tags");
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      handleUploadFiles(droppedFiles);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteVaultFile(id);
      if (result.success) return result.data;
      throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault-files"] });
      queryClient.invalidateQueries({ queryKey: ["workspace", "active"] });
      setSelectedFile(null);
      toast.success("File deleted");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete file");
    },
  });

  const handleAddTag = (tag: string) => {
    if (!selectedFile) return;
    const cleanTag = tag.trim();
    if (!cleanTag) return;
    if (selectedFile.tags.includes(cleanTag)) return;

    const newTags = [...selectedFile.tags, cleanTag];
    tagsMutation.mutate({ id: selectedFile.id, tags: newTags });
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    if (!selectedFile) return;
    const newTags = selectedFile.tags.filter((t) => t !== tag);
    tagsMutation.mutate({ id: selectedFile.id, tags: newTags });
  };

  return (
    <div
      className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0 overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col gap-6 overflow-hidden relative">
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary  flex flex-col items-center justify-center backdrop-blur-sm transition-all animate-in fade-in zoom-in duration-200">
            <div className="bg-background p-6 rounded-full shadow-xl mb-4">
              <UploadCloud className="h-12 w-12 text-primary animate-bounce" />
            </div>
            <p className="text-xl font-bold text-primary">
              Drop to upload your documents
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Images, PDFs, or Excel files only
            </p>
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl tracking-tight">Vaults</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Manage your documents and invoices securely.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                className="pl-9 w-[200px] md:w-[250px] h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center border p-1 h-9">
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setView("list")}
              >
                <ListIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setView("grid")}
              >
                <Grid className="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              <Plus className="h-4 w-4" /> Upload
            </Button>
          </div>
        </div>

        <ScrollArea
          className="flex-1 h-full min-h-0 bg-card/10 border p-4"
          ref={scrollRef}
        >
          {isLoading && !isRefetching ? (
            <VaultContentSkeleton view={view as any} />
          ) : (
            <>
              {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Search className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <h3 className="font-semibold">No files found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-[250px]">
                {search
                  ? `No results for "${search}". Try another keyword.`
                  : "Upload your first file to get started."}
              </p>
              {search && (
                <Button
                  variant="link"
                  className="mt-2 text-xs"
                  onClick={() => setSearch("")}
                >
                  Clear search
                </Button>
              )}
            </div>
          ) : view === "list" ? (
            <VaultItemList
              files={files}
              selectedFileId={selectedFile?.id}
              onSelect={setSelectedFile}
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {files.map((file: VaultFile) => (
                <VaultItemCard
                  key={file.id}
                  file={file}
                  isSelected={selectedFile?.id === file.id}
                  onSelect={setSelectedFile}
                />
              ))}
            </div>
          )}

          {/* Load More Trigger */}
          <div
            ref={loadMoreRef}
            className="h-10 flex items-center justify-center mt-4"
          >
            {isFetchingNextPage && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent animate-spin rounded-full" />
                Loading more...
              </div>
            )}
          </div>
            </>
          )}
        </ScrollArea>

      </div>

      {/* Detail Panel */}
      <div
        className={cn(
          "w-full lg:w-[400px] h-full flex flex-col shrink-0 transition-all overflow-hidden",
        )}
      >
        <HeaderStorageUsage />

        <div
          className={cn(
            "border mt-4 w-full h-full flex flex-col transition-all overflow-hidden",
            !selectedFile &&
              "hidden lg:flex opacity-50 grayscale select-none pointer-events-none",
          )}
        >
          {selectedFile ? (
            <>
              <div className="p-4 border-b flex justify-between items-center bg-muted/20">
                <h2 className="font-semibold text-sm">File Details</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {isLoading ? (
                <VaultDetailSkeleton />
              ) : (
                <>
                  <ScrollArea className="flex-1 h-full min-h-0 p-6">
                    <div className="space-y-6">
                      <div className="aspect-video border bg-muted/30 flex items-center justify-center overflow-hidden shadow-inner">
                        {selectedFile.type.startsWith("image/") ? (
                          <img
                            src={selectedFile.url}
                            className="max-w-full max-h-full object-contain"
                          />
                        ) : (
                          <FileText className="h-16 w-16 text-muted-foreground" />
                        )}
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-start justify-between group">
                          <h3 className="font-bold text-lg leading-tight break-all">
                            {selectedFile.name}
                          </h3>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-[120px,1fr] gap-x-4 gap-y-3 text-sm">
                          <span className="text-muted-foreground">
                            Date Created
                          </span>
                          <span className="font-medium">
                            {new Date(selectedFile.createdAt).toLocaleString()}
                          </span>

                          <span className="text-muted-foreground">Format</span>
                          <span className="font-medium text-primary uppercase">
                            {selectedFile.type.split("/")[1] ||
                              selectedFile.type}
                          </span>

                          <span className="text-muted-foreground">
                            File Size
                          </span>
                          <span className="font-medium">
                            {formatBytes(selectedFile.size)}
                          </span>

                          {selectedFile.type.startsWith("image/") && (
                            <>
                              <span className="text-muted-foreground">
                                Dimensions
                              </span>
                              <span className="font-medium">N/A</span>
                            </>
                          )}
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <Tag className="h-4 w-4" />
                              Tags
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                            {selectedFile.tags?.map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="px-2 py-0 text-[11px] h-6 flex items-center gap-1 group/tag bg-primary/10 text-primary border-primary/20"
                              >
                                {tag}
                                <button
                                  onClick={() => handleRemoveTag(tag)}
                                  className="hover:text-destructive shrink-0"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                            {(!selectedFile.tags ||
                              selectedFile.tags.length === 0) && (
                              <p className="text-xs text-muted-foreground italic">
                                No tags added
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                              Suggested Tags
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {SUGGESTED_TAGS.filter(
                                (t) => !selectedFile.tags?.includes(t),
                              ).map((tag) => (
                                <button
                                  key={tag}
                                  onClick={() => handleAddTag(tag)}
                                  className="text-[10px] px-2 py-1 rounded-full border border-dashed hover:border-primary hover:text-primary transition-colors bg-muted/30"
                                >
                                  + {tag}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="relative mt-2">
                            <Input
                              placeholder="Add custom tag..."
                              className="h-8 text-xs pr-12 focus-visible:ring-1"
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAddTag(tagInput);
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="absolute right-1 top-1 h-6 w-10 text-[10px] p-0"
                              onClick={() => handleAddTag(tagInput)}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>

                  <div className="p-4 border-t bg-muted/5 grid grid-cols-2 gap-3 mt-auto">
                    <div className="flex items-center gap-0.5 w-full">
                      <Button
                        variant="outline"
                        className="flex-1 rounded-r-none h-9 text-xs"
                        onClick={() => window.open(selectedFile.url, "_blank")}
                      >
                        <Download className="mr-2 h-4 w-4" /> View full
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            className="px-2 rounded-l-none border-l-0 h-9"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              window.open(selectedFile.url, "_blank")
                            }
                          >
                            <ExternalLink className="mr-2 h-4 w-4" /> Open
                            Original
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              const link = document.createElement("a");
                              link.href = selectedFile.url;
                              link.download = selectedFile.name;
                              link.click();
                            }}
                          >
                            <Download className="mr-2 h-4 w-4" /> Download Local
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Button
                      variant="outline"
                      className="h-9 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                      onClick={() => deleteMutation.mutate(selectedFile.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center text-muted-foreground/60 space-y-4">
              <div className="w-20 h-20 rounded-full border border-dashed flex items-center justify-center">
                <FileText className="h-10 w-10" />
              </div>
              <div>
                <p className="font-semibold text-sm">No file selected</p>
                <p className="text-[10px]">
                  Select a file to view its details, size, and manage tags.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeaderStorageUsage() {
  const { workspace, checkLimit } = useAppStore();

  if (!workspace) return null;

  const usage = workspace.vault_size_used_bytes || 0;
  const { limit, percent } = checkLimit("vault_size", usage / (1024 * 1024)); // checkLimit expects MB

  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <div className="flex justify-between items-center text-[10px]">
        <span className="text-muted-foreground">
          {formatBytes(usage)} / {limit} MB
        </span>
        <span
          className={cn(
            "font-bold",
            percent > 90
              ? "text-destructive"
              : percent > 70
                ? "text-amber-600"
                : "text-primary",
          )}
        >
          {Math.round(percent)}%
        </span>
      </div>
      <Progress value={percent} className="h-1 w-full" />
    </div>
  );
}
