"use client";

import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { createWallet, getWallet, updateWallet } from "@workspace/modules/client";
import type { Wallet } from "@workspace/types";
import {
  Button,
  CurrencyInput,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Switch,
} from "@workspace/ui";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { SelectAccountGroup } from "@/components/molecules/select-account-group";

const getAccountSchema = (dictionary: Dictionary["accounts"]) => {
  const nameError = dictionary.form.name.error_required || "Name is required";

  return z.object({
    name: z.string().trim().min(1, { message: String(nameError) }),
    groupId: z.string().optional().nullable(),
    balance: z.coerce.number().default(0),
    isIncludedInTotals: z.boolean().default(true),
    isDefault: z.boolean().default(false),
  });
};

interface AccountFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletId?: string;
  onSuccess?: (wallet: Wallet) => void;
  dictionary?: Dictionary;
  canEdit?: boolean;
}

export function AccountFormSheet({
  open,
  onOpenChange,
  walletId,
  onSuccess,
  dictionary,
  canEdit = true,
}: AccountFormSheetProps) {
  const [mounted, setMounted] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [wallet, setWallet] = React.useState<Wallet | undefined>();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch wallet only when sheet opens with a walletId (gated by `open` to avoid wasted calls)
  React.useEffect(() => {
    if (!open) {
      setWallet(undefined);
      return;
    }
    if (!walletId) return;
    let cancelled = false;
    (async () => {
      const res = await getWallet(walletId);
      if (!cancelled && res.success && res.data) {
        setWallet(res.data as Wallet);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, walletId]);

  const schema = React.useMemo(
    () => (dictionary ? getAccountSchema(dictionary.accounts) : null),
    [dictionary],
  );

  const form = useForm<z.infer<ReturnType<typeof getAccountSchema>>>({
    resolver: schema ? zodResolver(schema) : undefined,
    mode: "onSubmit",
    defaultValues: {
      name: "",
      groupId: null,
      balance: 0,
      isIncludedInTotals: true,
      isDefault: false,
    },
  });

  // Reset on open / when the entity hydrates
  React.useEffect(() => {
    if (!open) return;
    if (wallet) {
      form.reset({
        name: wallet.name,
        groupId: wallet.groupId,
        balance: Number(wallet.balance),
        isIncludedInTotals: wallet.isIncludedInTotals,
        isDefault: wallet.isDefault ?? false,
      });
    } else if (!walletId) {
      form.reset({
        name: "",
        groupId: null,
        balance: 0,
        isIncludedInTotals: true,
        isDefault: false,
      });
    }
  }, [open, wallet, walletId, form]);

  if (!mounted || !dictionary || !canEdit) return null;

  const onSubmit = async (values: z.infer<ReturnType<typeof getAccountSchema>>) => {
    setIsLoading(true);
    try {
      const payload = { ...values, balance: values.balance.toString() };
      const result = walletId
        ? await updateWallet(walletId, payload)
        : await createWallet(payload);

      if (!result.success) {
        throw new Error(result.error || "Something went wrong");
      }

      toast.success(walletId ? dictionary.accounts.toasts.updated : dictionary.accounts.toasts.created);

      // Optimistic cache patch
      if (result.data) {
        const updated = result.data as Wallet;
        queryClient.setQueriesData<any>({ queryKey: ["wallets"], exact: false }, (old: any) => {
          if (!old) return old;
          if ("pages" in old && Array.isArray(old.pages)) {
            if (walletId) {
              return {
                ...old,
                pages: old.pages.map((page: any) => ({
                  ...page,
                  data: (page.data ?? []).map((w: Wallet) => (w.id === updated.id ? { ...w, ...updated } : w)),
                })),
              };
            }
            const [firstPage, ...rest] = old.pages;
            if (!firstPage) return old;
            return {
              ...old,
              pages: [{ ...firstPage, data: [updated, ...(firstPage.data ?? [])] }, ...rest],
            };
          }
          if ("data" in old && Array.isArray(old.data)) {
            return walletId
              ? { ...old, data: old.data.map((w: Wallet) => (w.id === updated.id ? { ...w, ...updated } : w)) }
              : { ...old, data: [updated, ...old.data] };
          }
          return old;
        });

        onSuccess?.(updated);
      }

      form.reset();
      onOpenChange(false);

      // Background reconciliation
      void queryClient.invalidateQueries({ queryKey: ["wallets"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col p-0">
        <SheetHeader className="shrink-0 px-6 pt-6">
          <SheetTitle className="text-lg">
            {walletId ? dictionary.accounts.edit_account : dictionary.accounts.add_account}
          </SheetTitle>
        </SheetHeader>

        <div className="no-scrollbar flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
          <Form {...form}>
            <form id="account-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-normal text-muted-foreground text-xs">
                      {dictionary.accounts.account_name}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={dictionary.accounts.account_name_placeholder}
                        autoFocus
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="groupId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-normal text-muted-foreground text-xs">
                      {dictionary.accounts.group_label}
                    </FormLabel>
                    <FormControl>
                      <SelectAccountGroup
                        value={field.value || undefined}
                        onChange={field.onChange}
                        placeholder={dictionary.accounts.group_placeholder}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="balance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-normal text-muted-foreground text-xs">
                      {dictionary.accounts.initial_balance}
                    </FormLabel>
                    <FormControl>
                      <CurrencyInput value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isIncludedInTotals"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 border p-4">
                    <div className="space-y-1">
                      <FormLabel className="font-normal text-foreground text-sm">
                        {dictionary.accounts.include_in_totals_label}
                      </FormLabel>
                      <FormDescription>{dictionary.accounts.include_in_totals_description}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 border p-4">
                    <div className="space-y-1">
                      <FormLabel className="font-normal text-foreground text-sm">
                        {dictionary.accounts.default_label ?? "Default account"}
                      </FormLabel>
                      <FormDescription>
                        {dictionary.accounts.default_description ??
                          "Used by Oewang Bot when no account is specified in a chat (WhatsApp, Telegram, etc.)."}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        <div className="absolute right-0 bottom-0 left-0 bg-background p-6">
          <Button
            form="account-form"
            type="submit"
            className="w-full"
            disabled={isLoading || !form.formState.isDirty}
          >
            {isLoading
              ? dictionary.accounts.saving
              : walletId
                ? dictionary.accounts.update_account
                : dictionary.accounts.create_account}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
