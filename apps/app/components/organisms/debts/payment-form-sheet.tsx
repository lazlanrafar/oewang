"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { type DebtWithContact, payDebt } from "@workspace/modules/client";
import type { Wallet } from "@workspace/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { SelectAccount } from "@/components/molecules/select-account";
import { useAppStore } from "@/stores/app";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { formatCurrency } from "@workspace/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt?: DebtWithContact;
  wallets: Wallet[];
}

export function PaymentFormSheet({ open, onOpenChange, debt, wallets }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const { settings } = useAppStore();

  const remaining = debt ? Number.parseFloat(debt.remainingAmount as string) : 0;

  const paymentSchema = z.object({
    amount: z.coerce
      .number()
      .positive("Amount must be positive")
      .max(remaining, "Payment cannot exceed remaining debt amount"),
    walletId: z.string().min(1, "Account is required"),
  });

  type PaymentFormValues = z.infer<typeof paymentSchema>;

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema as any),
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
      if (!debt?.id) throw new Error("Debt ID missing");
      return payDebt(debt.id, {
        amount: data.amount,
        walletId: data.walletId,
      });
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      queryClient.invalidateQueries({ queryKey: ["debts"] });
      // Invalidate wallets and transactions since a new transaction is created
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      form.reset();
      onOpenChange(false);
      router.refresh();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to record payment");
    },
  });

  async function onSubmit(data: PaymentFormValues) {
    setIsLoading(true);
    await mutation.mutateAsync(data).finally(() => setIsLoading(false));
  }

  if (!debt) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col h-full p-0 rounded-none shadow-none border-l sm:max-w-[540px]">
        <SheetHeader className="px-6 py-6 border-b shrink-0 bg-muted/5 text-left">
          <SheetTitle className="font-serif text-xl font-normal">Record Payment</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar">
          <Form {...form}>
            <form id="payment-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="rounded-none border border-border/50 p-4 bg-muted/5 space-y-2 mb-8">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Paying to/from</p>
                <p className="text-lg font-serif font-normal">{debt.contactName}</p>
                <div className="pt-2 border-t border-border/50">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Remaining balance</p>
                  <p className="text-lg font-serif text-primary font-normal">{formatCurrency(remaining, settings)}</p>
                </div>
              </div>

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Amount to Pay</FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/50 transition-colors group-focus-within:text-foreground">
                          {settings?.mainCurrencySymbol ?? "$"}
                        </span>
                        <CurrencyInput
                          value={field.value}
                          onChange={field.onChange}
                          currencySymbol={settings?.mainCurrencySymbol}
                          decimalPlaces={settings?.mainCurrencyDecimalPlaces}
                          className={cn(
                            "pl-8 text-2xl bg-transparent h-12 rounded-none border-border focus:border-foreground font-serif tracking-tight font-normal",
                            debt.type === "payable" ? "text-rose-500" : "text-emerald-500"
                          )}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      The amount being settled.
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
                    <FormLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Account</FormLabel>
                    <FormControl>
                      <SelectAccount
                        value={field.value ?? undefined}
                        onChange={(id) => form.setValue("walletId", id)}
                        className="bg-transparent rounded-none h-12 border-border focus:border-foreground w-full justify-start text-left px-3 font-medium"
                      />
                    </FormControl>
                    <FormDescription className="text-[10px] uppercase tracking-wider opacity-60">
                      Select the account where the transaction happened.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        <div className="p-6 border-t bg-background shrink-0 mt-auto">
          <Button
            form="payment-form"
            type="submit"
            className="w-full rounded-none h-12 uppercase tracking-widest font-medium text-xs"
            disabled={isLoading || remaining <= 0}
          >
            {isLoading ? "Saving…" : "Save Payment"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
