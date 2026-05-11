"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { type DebtWithContact, payDebt } from "@workspace/modules/client";
import type { TransactionSettings, Wallet } from "@workspace/types";
import {
  Button,
  CurrencyInput,
  cn,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui";
import {
  formatCurrency as formatCurrencyUtil,
  getCurrencyDisplayUnit,
} from "@workspace/utils";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { SelectAccount } from "@/components/molecules/select-account";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt?: DebtWithContact;
  wallets: Wallet[];
  dictionary: Dictionary;
  settings: TransactionSettings;
}

export function PaymentFormSheet({ open, onOpenChange, debt, wallets: _wallets, dictionary, settings }: Props) {
  const currencyUnit = getCurrencyDisplayUnit(
    settings?.mainCurrencyCode,
    settings?.mainCurrencySymbol,
  );
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const dict = dictionary.debts;

  const formatCurrency = (amount: number, options?: Parameters<typeof formatCurrencyUtil>[2]) =>
    formatCurrencyUtil(amount, settings, options);

  const remaining = debt ? Number.parseFloat(debt.remainingAmount as string) : 0;

  const paymentSchema = z.object({
    amount: z.coerce
      .number()
      .positive(dict.form.amount.error_positive)
      .max(remaining, dict.form.amount.error_max_remaining),
    walletId: z.string().min(1, dict.form.account.error_required),
  });

  type PaymentFormValues = z.infer<typeof paymentSchema>;

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: remaining,
      walletId: "",
    },
  });

  useEffect(() => {
    if (open && debt) {
      form.reset({
        amount: remaining,
        walletId: "",
      });
    }
  }, [open, debt, form, remaining]);

  const mutation = useMutation({
    mutationFn: async (data: PaymentFormValues) => {
      if (!debt.id) throw new Error("Debt ID missing");
      return payDebt(debt.id, {
        amount: data.amount,
        walletId: data.walletId,
      });
    },
    onSuccess: () => {
      toast.success(dict.toasts.payment_recorded);
      queryClient.invalidateQueries({ queryKey: ["debts"] });
      // Invalidate wallets and transactions since a new transaction is created
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      form.reset();
      onOpenChange(false);
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message || dict.toasts.payment_failed);
    },
  });

  async function onSubmit(data: PaymentFormValues) {
    setIsLoading(true);
    await mutation.mutateAsync(data).finally(() => setIsLoading(false));
  }

  if (!debt) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[540px]">
        <SheetHeader className="shrink-0 border-b bg-muted/5 px-6 py-6 text-left">
          <SheetTitle className="font-normal font-serif text-xl">{dict.form.payment.title}</SheetTitle>
        </SheetHeader>

        <div className="no-scrollbar flex-1 overflow-y-auto px-6 py-6">
          <Form {...form}>
            <form id="payment-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="mb-8 space-y-2 rounded-none border border-border/50 bg-muted/5 p-4">
                <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                  {dict.form.payment.paying_to_from}
                </p>
                <p className="font-normal font-serif text-lg">{debt.contactName}</p>
                <div className="border-border/50 border-t pt-2">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                    {dict.form.payment.remaining_balance}
                  </p>
                  <p className="font-normal font-serif text-lg text-primary">{formatCurrency(remaining)}</p>
                </div>
              </div>

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                      {dict.form.payment.amount_to_pay}
                    </FormLabel>
                    <FormControl>
                      <div className="group relative">
                        <span className="-translate-y-1/2 absolute top-1/2 left-3 text-muted-foreground/50 text-sm transition-colors group-focus-within:text-foreground">
                          {currencyUnit}
                        </span>
                        <CurrencyInput
                          value={field.value}
                          onChange={field.onChange}
                          currencySymbol={settings?.mainCurrencySymbol}
                          decimalPlaces={settings?.mainCurrencyDecimalPlaces}
                          className={cn(
                            "h-12 rounded-none border-border bg-transparent pl-14 font-normal font-serif text-2xl tracking-tight focus:border-foreground",
                            debt.type === "payable" ? "text-rose-500" : "text-emerald-500",
                          )}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      {dict.form.payment.amount_to_pay_description}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="walletId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                      {dict.form.account.label}
                    </FormLabel>
                    <FormControl>
                      <SelectAccount
                        value={field.value ?? undefined}
                        onChange={(id) => form.setValue("walletId", id)}
                        className="h-12 w-full justify-start rounded-none border-border bg-transparent px-3 text-left font-medium focus:border-foreground"
                      />
                    </FormControl>
                    <FormDescription className="text-[10px] uppercase tracking-wider opacity-60">
                      {dict.form.account.description}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        <div className="mt-auto shrink-0 border-t bg-background p-6">
          <Button
            form="payment-form"
            type="submit"
            className="h-12 w-full rounded-none font-medium text-xs uppercase tracking-widest"
            disabled={isLoading || remaining <= 0}
          >
            {isLoading ? dict.form.saving : dict.form.payment.submit}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
