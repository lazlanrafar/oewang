"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import type { ParsedReceipt } from "@workspace/modules/ai/ai.action";
import { createTransaction } from "@workspace/modules/transaction/transaction.action";
import {
  Button,
  CurrencyInput,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  InputDate,
} from "@workspace/ui";
import { getCurrencyDisplayUnit } from "@workspace/utils";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { SelectAccount } from "@/components/molecules/select-account";
import { SelectCategory } from "@/components/molecules/select-category";
import { useAppStore } from "@/stores/app";

const confirmationSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  date: z.string().min(1, "Date is required"),
  name: z.string().min(1, "Merchant/Name is required"),
  categoryId: z.string().optional(),
  walletId: z.string().min(1, "Account is required"),
});

type ConfirmationFormValues = z.infer<typeof confirmationSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ParsedReceipt | null;
  vaultFileId: string | null;
  onSuccess?: () => void;
}

export function TransactionReceiptConfirmationModal({ open, onOpenChange, data, vaultFileId, onSuccess }: Props) {
  const { settings, user } = useAppStore();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const currencyUnit = getCurrencyDisplayUnit(
    settings?.mainCurrencyCode,
    settings?.mainCurrencySymbol,
  );

  const form = useForm<ConfirmationFormValues>({
    resolver: zodResolver(confirmationSchema),
    defaultValues: {
      amount: 0,
      date: new Date().toISOString().split("T")[0],
      name: "",
      categoryId: "",
      walletId: "",
    },
  });

  useEffect(() => {
    if (open && data) {
      form.reset({
        amount: data.amount,
        date: data.date ? data.date.split("T")[0] : new Date().toISOString().split("T")[0],
        name: data.name || "",
        categoryId: data.categoryId || "",
        walletId: "", // User needs to select a wallet
      });
    }
  }, [open, data, form]);

  const onSubmit = async (values: ConfirmationFormValues) => {
    if (!vaultFileId) return;
    setIsLoading(true);
    try {
      const payload = {
        ...values,
        amount: values.amount.toString(),
        type: "expense" as const,
        attachmentIds: [vaultFileId],
        assignedUserId: user?.id,
      };

      const result = await createTransaction(payload);
      if (result.success) {
        toast.success("Transaction created from receipt");
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(result.error || "Failed to create transaction");
      }
    } catch (error) {
      console.error(error);
      toast.error("An error occurred while saving the transaction");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Confirm Transaction</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Merchant / Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Starbucks" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <div className="group relative">
                        <span className="-translate-y-1/2 absolute top-1/2 left-3 text-muted-foreground/50 text-sm">
                          {currencyUnit}
                        </span>
                        <CurrencyInput
                          value={field.value}
                          onChange={field.onChange}
                          currencySymbol={settings?.mainCurrencySymbol}
                          decimalPlaces={settings?.mainCurrencyDecimalPlaces}
                          className="pl-14"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <InputDate value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="walletId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account</FormLabel>
                  <FormControl>
                    <SelectAccount value={field.value} onChange={(id) => form.setValue("walletId", id)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <SelectCategory
                      value={field.value}
                      type="expense"
                      onChange={(id) => form.setValue("categoryId", id)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Saving..." : "Confirm & Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
