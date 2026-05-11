"use client";

import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
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
  ScrollArea,
  Sheet,
  SheetContent,
  Switch,
} from "@workspace/ui";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { SelectAccountGroup } from "@/components/molecules/select-account-group";

const getAccountSchema = (dictionary: Dictionary["accounts"]) => {
  const nameError = dictionary.form.name.error_required || "Name is required";

  return z.object({
    name: z
      .string()
      .trim()
      .min(1, { message: String(nameError) }),
    groupId: z.string().optional().nullable(),
    balance: z.coerce.number().default(0),
    isIncludedInTotals: z.boolean().default(true),
  });
};

function InternalAccountForm({
  wallet,
  walletId,
  onSuccess,
  onOpenChange,
  dictionary,
}: {
  wallet?: Wallet;
  walletId?: string;
  onSuccess?: (wallet: Wallet) => void;
  onOpenChange: (open: boolean) => void;
  dictionary: Dictionary;
}) {
  const [isLoading, setIsLoading] = React.useState(false);

  const schema = React.useMemo(() => getAccountSchema(dictionary.accounts), [dictionary]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: "onSubmit",
    defaultValues: {
      name: wallet?.name || "",
      groupId: wallet?.groupId || null,
      balance: wallet?.balance ? Number(wallet.balance) : 0,
      isIncludedInTotals: wallet?.isIncludedInTotals ?? true,
    },
  });

  // Reset form when wallet changes
  React.useEffect(() => {
    if (wallet) {
      form.reset({
        name: wallet.name,
        groupId: wallet.groupId,
        balance: Number(wallet.balance),
        isIncludedInTotals: wallet.isIncludedInTotals,
      });
    } else if (!walletId) {
      form.reset({
        name: "",
        groupId: null,
        balance: 0,
        isIncludedInTotals: true,
      });
    }
  }, [wallet, walletId, form]);

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setIsLoading(true);
    try {
      // API expects balance as a string decimal
      const formattedValues = {
        ...values,
        balance: values.balance.toString(),
      };

      const result = walletId ? await updateWallet(walletId, formattedValues) : await createWallet(formattedValues);

      if (result.success) {
        toast.success(walletId ? dictionary.accounts.toasts.updated : dictionary.accounts.toasts.created);
        onSuccess?.(result.data);
        onOpenChange(false);
      } else {
        toast.error(result.error || "Something went wrong");
      }
    } catch (error) {
      console.error("Form submission error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full flex-col" noValidate>
        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 py-6 pb-24">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{dictionary.accounts.account_name}</FormLabel>
                    <FormControl>
                      <Input placeholder={dictionary.accounts.account_name_placeholder} {...field} />
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
                    <SelectAccountGroup
                      value={field.value || undefined}
                      onChange={field.onChange}
                      placeholder={dictionary.accounts.group_placeholder}
                    />
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
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{dictionary.accounts.include_in_totals_label}</FormLabel>
                      <FormDescription>{dictionary.accounts.include_in_totals_description}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>
        </ScrollArea>

        <div className="absolute right-0 bottom-0 left-0 border-t bg-background/80 p-6 backdrop-blur-md">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading
              ? dictionary.accounts.saving
              : wallet?.id
                ? dictionary.accounts.update_account
                : dictionary.accounts.create_account}
          </Button>
        </div>
      </form>
    </Form>
  );
}

interface AccountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletId?: string;
  onSuccess?: (wallet: Wallet) => void;
  dictionary?: Dictionary;
}

export function AccountFormSheet({
  open,
  onOpenChange,
  walletId,
  onSuccess,

  dictionary,
}: AccountSheetProps) {
  const [mounted, setMounted] = React.useState(false);

  const [wallet, setWallet] = React.useState<Wallet | undefined>();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (open && walletId) {
      const fetchWallet = async () => {
        const res = await getWallet(walletId);
        if (res.success && res.data) {
          setWallet(res.data as Wallet);
        }
      };
      fetchWallet();
    } else if (!open) {
      setWallet(undefined);
    }
  }, [open, walletId]);

  if (!mounted || !dictionary) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col p-0">
        <div className="mb-2 px-6 pt-6">
          <h2 className="border-b pb-2 font-semibold text-lg">
            {walletId ? dictionary.accounts.edit_account : dictionary.accounts.add_account}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {walletId ? dictionary.accounts.edit_description : dictionary.accounts.create_description}
          </p>
        </div>

        <InternalAccountForm
          wallet={wallet}
          onSuccess={onSuccess}
          onOpenChange={onOpenChange}
          dictionary={dictionary}
        />
      </SheetContent>
    </Sheet>
  );
}
