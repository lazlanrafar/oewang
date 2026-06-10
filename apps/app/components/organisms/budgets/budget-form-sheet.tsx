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
  canEdit?: boolean;
}

export function BudgetFormSheet({
  open,
  onOpenChange,
  budget,
  onSuccess,
  canEdit = true,
}: BudgetFormSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();
  const settings = useAppStore((state) => state.settings);

  useEffect(() => {
    setMounted(true);
  }, []);

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      categoryId: "",
      amount: 0,
    },
  });

  // Reset on every open so re-opening doesn't show stale values
  useEffect(() => {
    if (!open) return;
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
  }, [open, budget, form]);

  if (!mounted || !canEdit) return null;

  async function onSubmit(data: BudgetFormValues) {
    setIsLoading(true);
    try {
      const result = budget
        ? await updateBudget(budget.id, { amount: data.amount })
        : await createBudget(data);

      if (!result.success) {
        throw new Error(result.message || "Failed to save budget");
      }

      toast.success(budget ? "Budget updated successfully" : "Budget created successfully");

      // Optimistic cache patch on update — BudgetStatus list is held by queryKey ["budgets"]
      if (budget && result.data) {
        queryClient.setQueriesData<any>({ queryKey: ["budgets"], exact: false }, (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((b: BudgetStatus) =>
            b.id === budget.id ? { ...b, amount: data.amount } : b,
          );
        });
      }

      form.reset();
      onSuccess?.();
      onOpenChange(false);

      // Background reconciliation — picks up newly created rows + recomputes derived totals
      void queryClient.invalidateQueries({ queryKey: ["budgets"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save budget");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col p-0">
        <SheetHeader className="shrink-0 px-6 pt-6">
          <SheetTitle className="text-lg">{budget ? "Edit Budget" : "New Budget"}</SheetTitle>
        </SheetHeader>

        <div className="no-scrollbar flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
          <Form {...form}>
            <form id="budget-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-normal text-muted-foreground text-xs">Category</FormLabel>
                    <FormControl>
                      <SelectCategory
                        disabled={!!budget}
                        value={field.value}
                        type="expense"
                        onChange={field.onChange}
                      />
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
                    <FormLabel className="font-normal text-muted-foreground text-xs">Monthly Limit</FormLabel>
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
            </form>
          </Form>
        </div>

        <div className="absolute right-0 bottom-0 left-0 bg-background p-6">
          <Button
            form="budget-form"
            type="submit"
            className="w-full"
            disabled={isLoading || !form.formState.isDirty}
          >
            {isLoading ? "Saving..." : budget ? "Update Budget" : "Create Budget"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
