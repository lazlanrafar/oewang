"use client";

import * as React from "react";

import Image from "next/image";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import {
  deleteVaultFile,
  getVaultFiles,
  type PaginatedVaultFiles,
  updateVaultFileTags,
  uploadVaultFile,
  type VaultFile,
} from "@workspace/modules/vault/vault.action";
import {
  Badge,
  Button,
  cn,
  DataTableEmptyState,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Progress,
  ScrollArea,
  Separator,
} from "@workspace/ui";
import { formatBytes } from "@workspace/utils";
import {
  ChevronDown,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Grid,
  List as ListIcon,
  Plus,
  Search,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { toast } from "sonner";

import { useAppStore } from "@/stores/app";

import { VaultItemCard } from "./vault-item-card";
import { VaultItemList } from "./vault-item-list";
import { VaultContentSkeleton, VaultDetailSkeleton, VaultSkeletonLoading } from "./vault-skeleton-loading";

// Allowed file types for upload

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

const SUGGESTED_TAGS = ["Invoice", "Transaction", "Receipt", "Report", "Contract", "Document"];

interface Props {
  dictionary: Dictionary;
}

export function VaultClient({ dictionary }: Props) {
  const queryClient = useQueryClient();

  const t = dictionary.vault;
  const [view, setView] = useQueryState("view", parseAsString.withDefault("grid").withOptions({ shallow: true }));
  const [search, setSearch] = useQueryState("search", parseAsString.withDefault("").withOptions({ shallow: true }));

  const [isDragging, setIsDragging] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<VaultFile | null>(null);
  const [tagInput, setTagInput] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const limit = 15;

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, isRefetching } = useInfiniteQuery<
    PaginatedVaultFiles,
    Error
  >({
    queryKey: ["vault-files", search],
    queryFn: async ({ pageParam }) => {
      const result = await getVaultFiles(pageParam as number, limit, search || undefined);
      if (result.success) return result.data;
      throw new Error(result.error);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const current = lastPage.pagination?.page;
      const total = lastPage.pagination?.total_pages;
      if (current === undefined || total === undefined) return undefined;
      return current < total ? current + 1 : undefined;
    },
  });

  const files = React.useMemo(() => {
    return data?.pages?.flatMap((page) => page.files) || [];
  }, [data]);

  // Auto-select the first file when data loads and nothing is selected yet
  React.useEffect(() => {
    if (files.length > 0 && !selectedFile) {
      setSelectedFile(files[0]);
    }
  }, [files, selectedFile]);

  const _pagination = data?.pages?.[0]?.pagination;

  // Intersection Observer for Infinite Scroll
  React.useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries?.[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
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
        throw new Error(t.toasts.invalid_type.replace("{name}", file.name));
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
    onError: (error: Error) => {
      toast.error(error.message || t.toasts.upload_failed);
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
    onError: (error: Error) => {
      toast.error(error.message || t.toasts.tags_update_failed);
    },
  });

  const handleUploadFiles = async (selectedFiles: FileList | File[]) => {
    const filesArray = Array.from(selectedFiles);
    if (filesArray.length === 0) return;

    const toastId = toast.loading(t.toasts.uploading.replace("{count}", filesArray.length.toString()));

    try {
      await Promise.all(filesArray.map((file) => uploadMutation.mutateAsync(file)));
      toast.success(t.toasts.upload_success, { id: toastId });
    } catch (_error) {
      toast.error(t.toasts.upload_failed_some, { id: toastId });
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
      toast.success(t.toasts.delete_success);
    },
    onError: (error: Error) => {
      toast.error(error.message || t.toasts.delete_failed);
    },
  });

  const handleAddTag = (tag: string) => {
    if (!selectedFile) return;
    const cleanTag = tag.trim();
    if (!cleanTag) return;
    if (selectedFile?.tags.includes(cleanTag)) return;

    const newTags = [...selectedFile.tags, cleanTag];
    tagsMutation.mutate({ id: selectedFile?.id, tags: newTags });
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    if (!selectedFile) return;
    const newTags = selectedFile?.tags.filter((t) => t !== tag);
    tagsMutation.mutate({ id: selectedFile?.id, tags: newTags });
  };

  if (!dictionary || !t) return <VaultSkeletonLoading />;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden lg:flex-row"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="application"
      aria-label="Vault files"
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
      <div className="relative flex flex-1 flex-col gap-6 overflow-hidden">
        {isDragging && (
          <div className="fade-in zoom-in absolute inset-0 z-50 flex animate-in flex-col items-center justify-center border-2 border-primary border-dashed bg-primary/10 backdrop-blur-sm transition-all duration-200">
            <div className="mb-4 rounded-full bg-background p-6 shadow-xl">
              <UploadCloud className="h-12 w-12 animate-bounce text-primary" />
            </div>
            <p className="font-bold text-primary text-xl">{t.drop_zone.title}</p>
            <p className="mt-2 text-muted-foreground text-sm">{t.drop_zone.description}</p>
          </div>
        )}

        <div className="flex shrink-0 flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl tracking-tight">{t.title}</h1>
            </div>
            <p className="text-muted-foreground text-sm">{t.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t.search_placeholder}
                className="h-9 w-[200px] pl-9 md:w-[250px]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex h-9 items-center border p-1">
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
              <Plus className="h-4 w-4" /> {t.upload_button}
            </Button>
          </div>
        </div>

        <ScrollArea className="h-full min-h-0 flex-1 border bg-card/10 p-4" ref={scrollRef}>
          {isLoading && !isRefetching ? (
            <VaultContentSkeleton view={view === "grid" ? "grid" : "list"} />
          ) : (
            <>
              {files.length === 0 ? (
                <DataTableEmptyState
                  title={t.empty.title}
                  description={search ? t.empty.no_results.replace("{search}", search) : t.empty.get_started}
                  action={
                    search
                      ? {
                          label: t.empty.clear_search,
                          onClick: () => setSearch(""),
                        }
                      : {
                          label: t.empty.action,
                          onClick: () => fileInputRef.current?.click(),
                        }
                  }
                />
              ) : view === "list" ? (
                <VaultItemList
                  files={files}
                  selectedFileId={selectedFile?.id}
                  onSelect={setSelectedFile}
                  dictionary={dictionary}
                />
              ) : (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {files.map((file: VaultFile) => (
                    <VaultItemCard
                      key={file.id}
                      file={file}
                      isSelected={selectedFile?.id === file.id}
                      onSelect={setSelectedFile}
                      dictionary={dictionary}
                    />
                  ))}
                </div>
              )}

              {/* Load More Trigger */}
              <div ref={loadMoreRef} className="mt-4 flex h-10 items-center justify-center">
                {isFetchingNextPage && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    {dictionary.common.loading_more || "Loading more..."}
                  </div>
                )}
              </div>
            </>
          )}
        </ScrollArea>
      </div>

      {/* Detail Panel */}
      <div className={cn("flex h-full w-full shrink-0 flex-col overflow-hidden transition-all lg:w-[400px]")}>
        <HeaderStorageUsage dictionary={dictionary} />

        <div
          className={cn(
            "mt-4 flex h-full w-full flex-col overflow-hidden border transition-all",
            !selectedFile && "pointer-events-none hidden select-none opacity-50 grayscale lg:flex",
          )}
        >
          {selectedFile ? (
            <>
              <div className="flex items-center justify-between border-b bg-muted/20 p-4">
                <h2 className="font-semibold text-sm">{t.details.title}</h2>
                <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {isLoading ? (
                <VaultDetailSkeleton />
              ) : (
                <>
                  <ScrollArea className="h-full min-h-0 flex-1 p-6">
                    <div className="space-y-6">
                      <div className="flex aspect-video items-center justify-center overflow-hidden border bg-muted/30 shadow-inner">
                        {selectedFile?.type.startsWith("image/") ? (
                          <div className="relative h-full w-full">
                            <Image
                              src={selectedFile?.url || ""}
                              alt={selectedFile?.name || "Selected vault file"}
                              fill
                              unoptimized
                              sizes="(max-width: 768px) 100vw, 50vw"
                              className="object-contain"
                            />
                          </div>
                        ) : (
                          <FileText className="h-16 w-16 text-muted-foreground" />
                        )}
                      </div>

                      <div className="space-y-4">
                        <div className="group flex items-start justify-between">
                          <h3 className="break-all font-bold text-lg leading-tight">{selectedFile?.name}</h3>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-[120px,1fr] gap-x-4 gap-y-3 text-sm">
                          <span className="text-muted-foreground">{t.details.date_created}</span>
                          <span className="font-medium">{new Date(selectedFile?.createdAt).toLocaleString()}</span>

                          <span className="text-muted-foreground">{t.details.format}</span>
                          <span className="font-medium text-primary uppercase">
                            {selectedFile?.type.split("/")[1] || selectedFile?.type}
                          </span>

                          <span className="text-muted-foreground">{t.details.file_size}</span>
                          <span className="font-medium">{formatBytes(selectedFile?.size)}</span>

                          {selectedFile?.type.startsWith("image/") && (
                            <>
                              <span className="text-muted-foreground">{t.details.dimensions}</span>
                              <span className="font-medium">N/A</span>
                            </>
                          )}
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-semibold text-sm">
                              <Tag className="h-4 w-4" />
                              Tags
                            </div>
                          </div>

                          <div className="flex min-h-[32px] flex-wrap gap-1.5">
                            {selectedFile?.tags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="group/tag flex h-6 items-center gap-1 border-primary/20 bg-primary/10 px-2 py-0 text-[11px] text-primary"
                              >
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTag(tag)}
                                  className="shrink-0 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                            {(!selectedFile?.tags || selectedFile?.tags.length === 0) && (
                              <p className="text-muted-foreground text-xs italic">{t.details.no_tags}</p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                              {t.details.suggested_tags}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {SUGGESTED_TAGS.filter((t) => !selectedFile?.tags.includes(t)).map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => handleAddTag(tag)}
                                  className="rounded-full border border-dashed bg-muted/30 px-2 py-1 text-[10px] transition-colors hover:border-primary hover:text-primary"
                                >
                                  + {tag}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="relative mt-2">
                            <Input
                              placeholder={t.details.add_custom_tag}
                              className="h-8 pr-12 text-xs focus-visible:ring-1"
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAddTag(tagInput);
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="absolute top-1 right-1 h-6 w-10 p-0 text-[10px]"
                              onClick={() => handleAddTag(tagInput)}
                            >
                              {t.details.add_tag_button}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>

                  <div className="mt-auto grid grid-cols-2 gap-3 border-t bg-muted/5 p-4">
                    <div className="flex w-full items-center gap-0.5">
                      <Button
                        variant="outline"
                        className="h-9 flex-1 rounded-r-none text-xs"
                        onClick={() => window.open(selectedFile?.url, "_blank")}
                      >
                        <Download className="mr-2 h-4 w-4" /> {t.details.view_full}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="h-9 rounded-l-none border-l-0 px-2">
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => window.open(selectedFile?.url, "_blank")}>
                            <ExternalLink className="mr-2 h-4 w-4" /> {t.details.open_original}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              const link = document.createElement("a");
                              link.href = selectedFile?.url;
                              link.download = selectedFile?.name;
                              link.click();
                            }}
                          >
                            <Download className="mr-2 h-4 w-4" /> {t.details.download_local}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Button
                      variant="outline"
                      className="h-9 text-destructive text-xs hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => deleteMutation.mutate(selectedFile?.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> {t.details.delete}
                    </Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center space-y-4 p-10 text-center text-muted-foreground/60">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed">
                <FileText className="h-10 w-10" />
              </div>
              <div>
                <p className="font-semibold text-sm">{t.details.no_file_selected}</p>
                <p className="text-[10px]">{t.details.no_file_selected_desc}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeaderStorageUsage({ dictionary }: { dictionary: Dictionary }) {
  const { workspace, checkLimit } = useAppStore();

  if (!workspace) return null;

  const usage = workspace?.vault_size_used_bytes || 0;
  const { limit, percent } = checkLimit("vault_size", usage / (1024 * 1024)); // checkLimit expects MB
  const t = dictionary.vault;

  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">
          {t.storage.usage.replace("{used}", formatBytes(usage)).replace("{limit}", limit.toString())}
        </span>
        <span
          className={cn(
            "font-bold",
            percent > 90 ? "text-destructive" : percent > 70 ? "text-amber-600" : "text-primary",
          )}
        >
          {Math.round(percent)}%
        </span>
      </div>
      <Progress value={percent} className="h-1 w-full" />
    </div>
  );
}
