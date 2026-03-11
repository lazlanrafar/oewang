"use client";

import * as React from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  ScrollArea,
  Separator,
  Skeleton,
} from "@workspace/ui";
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
import { type VaultFile } from "@workspace/modules/vault/vault.action";

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
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const [search, setSearch] = React.useState("");
  const [isDragging, setIsDragging] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<VaultFile | null>(
    null,
  );
  const [tagInput, setTagInput] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [page, setPage] = React.useState(1);
  const limit = 15;

  const { data, isLoading } = useQuery({
    queryKey: ["vault-files", page],
    queryFn: async () => {
      const result = await getVaultFiles(page, limit);
      if (result.success) return result.data;
      throw new Error(result.error);
    },
  });

  const files = data?.files || [];
  const pagination = data?.pagination;

  console.log("vaults data", pagination);

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

  const filteredFiles =
    files?.filter((f: VaultFile) =>
      f.name.toLowerCase().includes(search.toLowerCase()),
    ) || [];

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / k ** i).toFixed(2)) + " " + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)] overflow-hidden">
        {/* Main Content Skeleton */}
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>

          <div className="flex-1 border rounded-xl p-4 bg-card/10">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          </div>

          <div className="h-12 border-t flex justify-between items-center px-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-8 w-64" />
          </div>
        </div>

        {/* Detail Panel Skeleton */}
        <div className="hidden lg:flex w-[400px] border rounded-xl bg-card flex-col shrink-0 overflow-hidden">
          <div className="p-4 border-b bg-muted/20">
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="p-6 space-y-6">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-3">
                <Skeleton className="h-5 w-16" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-14" />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-auto p-4 border-t bg-muted/5 flex gap-3">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)] overflow-hidden"
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
          <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-xl flex flex-col items-center justify-center backdrop-blur-sm transition-all animate-in fade-in zoom-in duration-200">
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
            <h1 className="text-2xl tracking-tight">Vaults</h1>
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
            <div className="flex items-center border rounded-md p-1 h-9">
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

        <ScrollArea className="flex-1 h-full min-h-0 bg-card/10 rounded-xl border p-4">
          {filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg">No files found</h3>
              <p className="text-muted-foreground mb-4">
                Upload some files to get started.
              </p>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus className="mr-2 h-4 w-4" /> Upload First File
              </Button>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filteredFiles.map((file: VaultFile) => (
                <div
                  key={file.id}
                  className={cn(
                    "group relative aspect-square rounded-lg border-2 overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-primary/20",
                    selectedFile?.id === file.id
                      ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                      : "border-transparent hover:border-muted-foreground/30",
                  )}
                  onClick={() => setSelectedFile(file)}
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
              ))}
            </div>
          ) : (
            <div className="min-w-full">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase h-10">
                    <th className="px-4 text-left font-medium">Filename</th>
                    <th className="px-4 text-left font-medium">Format</th>
                    <th className="px-4 text-right font-medium">File Size</th>
                    <th className="px-4 text-right font-medium">
                      Date Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredFiles.map((file: VaultFile) => (
                    <tr
                      key={file.id}
                      className={cn(
                        "h-14 cursor-pointer transition-colors hover:bg-muted/50",
                        selectedFile?.id === file.id && "bg-primary/5",
                      )}
                      onClick={() => setSelectedFile(file)}
                    >
                      <td className="px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center shrink-0">
                            {file.type.startsWith("image/") ? (
                              <img
                                src={file.url}
                                className="w-full h-full object-cover rounded"
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
                      <td className="px-4 text-primary font-medium">
                        {file.type}
                      </td>
                      <td className="px-4 text-right tabular-nums">
                        {formatSize(file.size)}
                      </td>
                      <td className="px-4 text-right text-muted-foreground">
                        {new Date(file.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ScrollArea>

        {/* Pagination Controls */}
        {pagination && pagination.total > 0 && (
          <div className="flex items-center justify-between px-2 shrink-0 h-12 border-t mt-auto">
            <div className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-medium">{(page - 1) * limit + 1}</span> to{" "}
              <span className="font-medium">
                {Math.min(page * limit, pagination.total)}
              </span>{" "}
              of <span className="font-medium">{pagination.total}</span> files
            </div>
            {pagination.total_pages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from(
                    { length: pagination.total_pages },
                    (_, i) => i + 1,
                  )
                    .filter((p) => {
                      // Show current page, first, last, and neighbors
                      return (
                        p === 1 ||
                        p === pagination.total_pages ||
                        Math.abs(p - page) <= 1
                      );
                    })
                    .map((p, i, arr) => (
                      <React.Fragment key={p}>
                        {i > 0 && arr[i - 1] !== p - 1 && (
                          <span className="text-muted-foreground px-1">
                            ...
                          </span>
                        )}
                        <Button
                          variant={page === p ? "secondary" : "ghost"}
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </Button>
                      </React.Fragment>
                    ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  disabled={page >= pagination.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      <div
        className={cn(
          "w-full lg:w-[400px] h-full border rounded-xl bg-card flex flex-col shrink-0 transition-all overflow-hidden",
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

            <ScrollArea className="flex-1 h-full min-h-0 p-6">
              <div className="space-y-6">
                <div className="aspect-video rounded-lg border bg-muted/30 flex items-center justify-center overflow-hidden shadow-inner">
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
                    <span className="text-muted-foreground">Date Created</span>
                    <span className="font-medium">
                      {new Date(selectedFile.createdAt).toLocaleString()}
                    </span>

                    <span className="text-muted-foreground">Format</span>
                    <span className="font-medium text-primary uppercase">
                      {selectedFile.type.split("/")[1] || selectedFile.type}
                    </span>

                    <span className="text-muted-foreground">File Size</span>
                    <span className="font-medium">
                      {formatSize(selectedFile.size)}
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
                      onClick={() => window.open(selectedFile.url, "_blank")}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" /> Open Original
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
  );
}
