"use client";

import * as React from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@workspace/ui";
import { Loader2, ShieldCheck, Unlink } from "lucide-react";
import { toast } from "sonner";

import { disconnectProviderAction, getProvidersAction } from "@workspace/modules/user/user.action";

interface AccountFormProps {
  dictionary: {
    settings: {
      account: {
        providers: {
          title: string;
          description: string;
          disconnect: string;
          disconnect_confirm: string;
          disconnect_success: string;
          primary_label: string;
        };
      };
    };
  };
}

export function AccountForm({ dictionary }: AccountFormProps) {
  const { providers: t } = dictionary.settings.account;

  const { data, isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: async () => {
      const result = await getProvidersAction();
      if (result.success) return result.data;
      throw new Error(result.error);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      if (!window.confirm(t.disconnect_confirm)) return;
      const result = await disconnectProviderAction(provider);
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      toast.success(t.disconnect_success);
    },
    onError: (error) => {
      toast.error(`Error: ${(error as Error).message}`);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-[200px] mb-2" />
          <Skeleton className="h-4 w-[350px]" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="size-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-[100px]" />
                  <Skeleton className="h-3 w-[150px]" />
                </div>
              </div>
              <Skeleton className="h-8 w-[100px]" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const providers = data?.providers || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.title}</CardTitle>
          <CardDescription>{t.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {providers.length === 0 && <p className="text-sm text-muted-foreground">No providers linked.</p>}
          {providers.map((provider) => (
            <div key={provider} className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted capitalize font-bold">
                  {provider.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium capitalize">{provider}</p>
                  <p className="text-xs text-muted-foreground">Logged in via {provider}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* For now we just show a badge for all since we don't distinguish primary yet easily without more complex identity check */}
                {/* But we can disable disconnect for the very last one */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={providers.length <= 1 || disconnectMutation.isPending}
                  onClick={() => disconnectMutation.mutate(provider)}
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <Unlink className="size-4 mr-2" />
                  )}
                  {t.disconnect}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
