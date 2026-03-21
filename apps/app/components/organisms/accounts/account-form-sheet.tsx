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

const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  groupId: z.string().optional().nullable(),
  balance: z.coerce.number().default(0),
  isIncludedInTotals: z.boolean().default(true),
});

type AccountFormValues = z.infer<typeof accountSchema>;

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
  const { settings } = useAppStore();

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema as any),
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
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        balance: data.balance.toString(),
      };

      if (wallet?.id) {
        const res = await updateWallet(wallet.id, payload);
        if (res.success && res.data) {
          toast.success("Account updated successfully");
          onSuccess?.(res.data);
          onOpenChange(false);
        } else {
          toast.error(res.error || "Failed to update account");
        }
      } else {
        const res = await createWallet(payload);
        if (res.success && res.data) {
          toast.success("Account created successfully");
          // For creation, we might want to invalidate the whole query instead of just surgical update if it's a new item
          // But AccountsClient can also handle it via onSuccess if we want to prepend/append
          onSuccess?.(res.data);
          onOpenChange(false);
        } else {
          toast.error(res.error || "Failed to create account");
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="mb-0">
          <SheetTitle>{wallet ? "Edit Account" : "Add Account"}</SheetTitle>
          <SheetDescription>
            {wallet
              ? "Update your account details below."
              : "Create a new financial account to track your balance."}
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
                      <FormLabel>Account Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Personal Savings, Business..."
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
                      <FormLabel>Group</FormLabel>
                      <FormControl>
                        <SelectAccountGroup
                          value={field.value || undefined}
                          onChange={field.onChange}
                          placeholder="Select account group"
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
                      <FormLabel>Initial Balance</FormLabel>
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
                          Include in Totals
                        </FormLabel>
                        <div className="text-sm text-muted-foreground">
                          Show this account's balance in net worth calculations.
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
                  ? "Saving..."
                  : wallet
                    ? "Update Account"
                    : "Create Account"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
