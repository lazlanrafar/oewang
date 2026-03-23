"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Skeleton, Separator } from "@workspace/ui";
import { Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import {
  disconnectProviderAction,
  getProvidersAction,
} from "@workspace/modules/user/user.action";
import { useAppStore } from "@/stores/app";

function SettingAccountSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Skeleton className="h-6 w-48 rounded-none" />
        <Skeleton className="h-4 w-72 rounded-none" />
      </div>
      <Separator className="rounded-none" />
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between border-t py-6 first:border-t-0"
          >
            <div className="flex items-center gap-4">
              <Skeleton className="size-10 rounded-none text-xs" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24 rounded-none" />
                <Skeleton className="h-3 w-32 rounded-none" />
              </div>
            </div>
            <Skeleton className="h-8 w-24 rounded-none" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountForm() {
  const { dictionary, isLoading: isDictLoading } = useAppStore() as any;
  const account = dictionary?.settings?.account;
  const providers_t = account?.providers;

  const { data, isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: async () => {
      const result = await getProvidersAction();
      if (result.success) return result.data;
      throw new Error(result.error);
    },
  });

  const queryClient = useQueryClient();

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      if (!providers_t) return;
      if (!window.confirm(providers_t.disconnect_confirm)) return;
      const result = await disconnectProviderAction(provider);
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      toast.success(providers_t?.disconnect_success);
      queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
    onError: (error) => {
      toast.error(`Error: ${(error as Error).message}`);
    },
  });

  if (isLoading || isDictLoading || !account || !providers_t) {
    return <SettingAccountSkeleton />;
  }

  const providers = data?.providers || [];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-tight">{account.title}</h2>
        <p className="text-xs text-muted-foreground">{account.description}</p>
      </div>
      <Separator className="rounded-none" />

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium">{providers_t.title}</h3>
          <p className="text-xs text-muted-foreground">
            {providers_t.description}
          </p>
        </div>

        <div className="space-y-0">
          {providers.length === 0 && (
            <p className="text-sm text-muted-foreground font-medium">
              {account.no_providers}
            </p>
          )}
          {providers.map((provider) => (
            <div
              key={provider}
              className="flex items-center justify-between border-b last:border-b-0 py-6 border"
            >
              <div className="flex items-center gap-4">
                <div className="flex size-10 items-center justify-center rounded-none bg-muted capitalize font-bold text-xs">
                  {provider.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium capitalize tracking-tight">
                    {provider}
                  </p>
                  <p className="text-[11px] text-muted-foreground tracking-tight">
                    {account.form.logged_in_via} {provider}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-none h-8 text-xs font-normal"
                  disabled={
                    providers.length <= 1 || disconnectMutation.isPending
                  }
                  onClick={() => disconnectMutation.mutate(provider)}
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <Unlink className="size-4 mr-2" />
                  )}
                  {providers_t.disconnect}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
