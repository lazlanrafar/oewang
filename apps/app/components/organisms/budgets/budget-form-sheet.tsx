"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { createBudget, updateBudget } from "@workspace/modules/client";
import type { BudgetStatus } from "@workspace/types";
import {
  Button,
  CurrencyInput,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { SelectCategory } from "@/components/molecules/select-category";
import { useAppStore } from "@/stores/app";

const budgetSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  amount: z.coerce.number().positive("Amount must be positive"),
});

type BudgetFormValues = z.infer<typeof budgetSchema>;

interface BudgetFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget?: BudgetStatus;
  onSuccess?: () => void;
}

export function BudgetFormSheet({ open, onOpenChange, budget, onSuccess }: BudgetFormSheetProps) {
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();
  const settings = useAppStore((state) => state.settings);

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      categoryId: "",
      amount: 0,
    },
  });

  useEffect(() => {
    if (open) {
      if (budget) {
        form.reset({
          categoryId: budget.categoryId,
          amount: budget.amount,
        });
      } else {
        form.reset({
          categoryId: "",
          amount: 0,
        });
      }
    }
  }, [open, budget, form]);

  async function onSubmit(data: BudgetFormValues) {
    setIsLoading(true);
    try {
      if (budget) {
        const result = await updateBudget(budget.id, { amount: data.amount });
        if (!result.success) throw new Error(result.message);
        toast.success("Budget updated successfully");
      } else {
        const result = await createBudget(data);
        if (!result.success) throw new Error(result.message);
        toast.success("Budget created successfully");
      }

      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      const error = err as Error;
      toast.error(error.message || "Failed to save budget");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{budget ? "Edit Budget" : "New Budget"}</SheetTitle>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-6">
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <SelectCategory disabled={!!budget} value={field.value} type="expense" onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monthly Limit</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      value={field.value}
                      onChange={field.onChange}
                      currencySymbol={settings?.mainCurrencySymbol}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Saving..." : budget ? "Update Budget" : "Create Budget"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
