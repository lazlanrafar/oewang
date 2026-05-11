"use client";

import { Separator, Skeleton } from "@workspace/ui";

export function VaultHeaderSkeleton() {
  return (
    <div className="flex shrink-0 flex-col items-start justify-between gap-4 md:flex-row md:items-center">
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
  );
}

export function VaultContentSkeleton({ view = "list" }: { view?: "grid" | "list" }) {
  const gridSkeletonIds = Array.from({ length: 15 }, (_, i) => `grid-skeleton-${i}`);
  const rowSkeletonIds = Array.from({ length: 12 }, (_, i) => `row-skeleton-${i}`);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden uppercase">
      {view === "grid" ? (
        <div className="grid h-full grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {gridSkeletonIds.map((id) => (
            <Skeleton key={id} className="aspect-square bg-muted/50" />
          ))}
        </div>
      ) : (
        <div className="h-full min-w-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="h-10 border-b font-medium text-muted-foreground text-xs">
                <th className="w-1/2 px-4 text-left font-medium">Filename</th>
                <th className="px-4 text-left font-medium">Format</th>
                <th className="px-4 text-right font-medium">File Size</th>
                <th className="px-4 text-right font-medium">Date Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rowSkeletonIds.map((id) => (
                <tr key={id} className="h-14">
                  <td className="px-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 shrink-0" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </td>
                  <td className="px-4">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="px-4 text-right">
                    <div className="flex justify-end">
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </td>
                  <td className="px-4 text-right">
                    <div className="flex justify-end">
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function VaultDetailSkeleton() {
  const metadataSkeletonIds = Array.from({ length: 4 }, (_, i) => `metadata-skeleton-${i}`);

  return (
    <div className="flex h-full w-full shrink-0 flex-col overflow-hidden border bg-card">
      <div className="border-b bg-muted/20 p-4">
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="space-y-6 p-6">
        <Skeleton className="aspect-video w-full rounded-lg" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <div className="space-y-3">
            {metadataSkeletonIds.map((id) => (
              <div key={id} className="flex justify-between">
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
      <div className="mt-auto flex gap-3 border-t bg-muted/5 p-4">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}

export function VaultSkeletonLoading({ view }: { view?: "grid" | "list" }) {
  return (
    <div className="flex h-full flex-1 flex-col gap-6 overflow-hidden lg:flex-row">
      <div className="flex flex-1 flex-col gap-6 overflow-hidden">
        <VaultHeaderSkeleton />
        <VaultContentSkeleton view={view} />
      </div>
      <div className="hidden w-[400px] lg:flex">
        <VaultDetailSkeleton />
      </div>
    </div>
  );
}
