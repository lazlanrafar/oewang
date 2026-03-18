"use client";

import * as React from "react";
import { Skeleton, Separator } from "@workspace/ui";

export function VaultHeaderSkeleton() {
  return (
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
  );
}

export function VaultContentSkeleton() {
  return (
    <div className="flex-1 flex flex-col gap-6 overflow-hidden">
      <div className="flex-1 border p-4 bg-card/10">
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
  );
}

export function VaultDetailSkeleton() {
  return (
    <div className="flex w-full h-full border bg-card flex-col shrink-0 overflow-hidden">
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
  );
}

export function VaultSkeletonLoading() {
  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full flex-1 overflow-hidden">
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        <VaultHeaderSkeleton />
        <VaultContentSkeleton />
      </div>
      <div className="hidden lg:flex w-[400px]">
        <VaultDetailSkeleton />
      </div>
    </div>
  );
}
