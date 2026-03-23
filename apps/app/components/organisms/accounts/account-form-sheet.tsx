"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Switch,
  CurrencyInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  ScrollArea,
} from "@workspace/ui";
import { createWallet, updateWallet } from "@workspace/modules/client";
import type { Wallet } from "@workspace/types";
import { useAppStore } from "@/stores/app";
import { SelectAccountGroup } from "@/components/molecules/select-account-group";

const getAccountSchema = (dictionary: any) =>
  z.object({
    name: z.string().min(1, dictionary?.accounts?.form?.name?.error_required ?? "Name is required"),
    groupId: z.string().optional().nullable(),
    balance: z.coerce.number().default(0),
    isIncludedInTotals: z.boolean().default(true),
  });

type AccountFormValues = z.infer<ReturnType<typeof getAccountSchema>>;

interface AccountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet?: Wallet;
  onSuccess?: (wallet: Wallet) => void;
}

export function AccountFormSheet({
  open,
  onOpenChange,
  wallet,
  onSuccess,
}: AccountSheetProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { settings, dictionary } = useAppStore();

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(getAccountSchema(dictionary) as any),
    defaultValues: {
      name: "",
      groupId: null,
      balance: 0,
      isIncludedInTotals: true,
    },
  });

  // Reset form when wallet changes or sheet opens
  useEffect(() => {
    if (open) {
      form.reset({
        name: wallet?.name ?? "",
        groupId: wallet?.groupId ?? null,
        balance: wallet?.balance ?? 0,
        isIncludedInTotals: wallet?.isIncludedInTotals ?? true,
      });
    }
  }, [open, wallet, form]);

  async function onSubmit(data: AccountFormValues) {
    if (!dictionary) return;
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        balance: data.balance.toString(),
      };

      if (wallet?.id) {
        const res = await updateWallet(wallet.id, payload);
        if (res.success && res.data) {
          toast.success(dictionary.accounts.toasts.updated);
          onSuccess?.(res.data);
          onOpenChange(false);
        } else {
          toast.error(res.error || dictionary.accounts.toasts.update_failed);
        }
      } else {
        const res = await createWallet(payload);
        if (res.success && res.data) {
          toast.success(dictionary.accounts.toasts.created);
          onSuccess?.(res.data);
          onOpenChange(false);
        } else {
          toast.error(res.error || dictionary.accounts.toasts.create_failed);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error(dictionary.settings.common.error);
    } finally {
      setIsLoading(false);
    }
  }

  if (!dictionary) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="mb-0">
          <SheetTitle>
            {wallet
              ? dictionary.accounts.edit_account
              : dictionary.accounts.add_account}
          </SheetTitle>
          <SheetDescription>
            {wallet
              ? dictionary.accounts.update_details
              : dictionary.accounts.create_description}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col h-full"
          >
            <ScrollArea className="h-full p-0">
              <div className="space-y-6 py-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{dictionary.accounts.account_name}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            dictionary.accounts.account_name_placeholder
                          }
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
                      <FormLabel>{dictionary.accounts.group_label}</FormLabel>
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
                      <FormLabel>{dictionary.accounts.initial_balance}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                            {settings?.mainCurrencySymbol ?? "$"}
                          </span>
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
                            currencySymbol={settings?.mainCurrencySymbol}
                            decimalPlaces={settings?.mainCurrencyDecimalPlaces}
                            className="pl-8 text-lg font-bold"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isIncludedInTotals"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="mb-2">
                          {dictionary.accounts.include_in_totals_label}
                        </FormLabel>
                        <div className="text-sm text-muted-foreground">
                          {dictionary.accounts.include_in_totals_description}
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </ScrollArea>

            <div className="mt-8 shrink-0">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading
                  ? dictionary.accounts.saving
                  : wallet
                    ? dictionary.accounts.update_account
                    : dictionary.accounts.create_account}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
