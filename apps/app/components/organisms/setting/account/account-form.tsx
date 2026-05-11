"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import {
  disconnectProviderAction,
  getProvidersAction,
} from "@workspace/modules/user/user.action";
import { Button, Separator, Skeleton } from "@workspace/ui";
import { Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers/confirm-modal-provider";

function SettingAccountSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Skeleton className="h-6 w-48 " />
        <Skeleton className="h-4 w-72 " />
      </div>
      <Separator className="" />
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between border-t py-6 first:border-t-0"
          >
            <div className="flex items-center gap-4">
              <Skeleton className="size-10  text-xs" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24 " />
                <Skeleton className="h-3 w-32 " />
              </div>
            </div>
            <Skeleton className="h-8 w-24 " />
          </div>
        ))}
      </div>
    </div>
  );
}

interface AccountFormProps {
  dictionary: Dictionary;
}

export function AccountForm({ dictionary }: AccountFormProps) {
  const account = dictionary.settings.account;
  const providers_t = account.providers;
  const confirm = useConfirm();

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
      const result = await disconnectProviderAction(provider);
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      toast.success(providers_t.disconnect_success || "Provider disconnected");
      queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
    onError: (error) => {
      toast.error(`Error: ${(error as Error).message}`);
    },
  });

  if (isLoading || !account || !providers_t) {
    return <SettingAccountSkeleton />;
  }

  const providers = data?.providers || [];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="font-medium text-lg tracking-tight">{account.title}</h2>
        <p className="text-muted-foreground text-xs">{account.description}</p>
      </div>
      <Separator className="" />

      <div className="space-y-6">
        <div>
          <h3 className="font-medium text-sm">{providers_t.title}</h3>
          <p className="text-muted-foreground text-xs">
            {providers_t.description}
          </p>
        </div>

        <div className="space-y-0">
          {providers.length === 0 && (
            <p className="font-medium text-muted-foreground text-sm">
              {account.no_providers}
            </p>
          )}
          {providers.map((provider) => (
            <div
              key={provider}
              className="flex items-center justify-between border border-b py-6 last:border-b-0"
            >
              <div className="flex items-center gap-4">
                <div className="flex size-10 items-center justify-center  bg-muted font-bold text-xs capitalize">
                  {provider.charAt(0)}
                </div>
                <div>
                  <p className="font-medium text-sm capitalize tracking-tight">
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
                  className="h-8  font-normal text-xs"
                  disabled={
                    providers.length <= 1 || disconnectMutation.isPending
                  }
                  onClick={async () => {
                    const ok = await confirm({
                      title: providers_t.disconnect || "Disconnect",
                      description:
                        providers_t.disconnect_confirm || "Are you sure?",
                      confirmLabel: providers_t.disconnect || "Disconnect",
                      cancelLabel: dictionary.common.cancel,
                      destructive: true,
                    });
                    if (!ok) return;
                    disconnectMutation.mutate(provider);
                  }}
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Unlink className="mr-2 size-4" />
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
