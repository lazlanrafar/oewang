"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { createDebt, type DebtWithContact, updateDebt } from "@workspace/modules/client";
import type { TransactionSettings } from "@workspace/types";
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
  Input,
  InputDate,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui";
import { getCurrencyDisplayUnit } from "@workspace/utils";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { SelectContact } from "@/components/molecules/select-contact";
import { FormSegmentedTabs } from "@/components/molecules/form-segmented-tabs";

const getDebtSchema = (dictionary: Dictionary["debts"], _remaining?: number) =>
  z.object({
    amount: z.coerce.number().positive(dictionary.form.amount.error_positive),
    contactId: z.string().min(1, dictionary.form.contact.error_required),
    type: z.enum(["payable", "receivable"]),
    description: z.string().optional(),
    dueDate: z.string().optional(),
  });

type DebtFormValues = z.infer<ReturnType<typeof getDebtSchema>>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt?: DebtWithContact;
  dictionary: Dictionary;
  settings: TransactionSettings;
}

export function DebtFormSheet({ open, onOpenChange, debt, dictionary, settings }: Props) {
  const currencyUnit = getCurrencyDisplayUnit(
    settings?.mainCurrencyCode,
    settings?.mainCurrencySymbol,
  );
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"payable" | "receivable">(
    debt?.type || "receivable",
  );
  const dict = dictionary.debts;

  const form = useForm<DebtFormValues>({
    resolver: zodResolver(getDebtSchema(dict)),
    defaultValues: {
      type: "receivable",
      amount: 0,
      contactId: "",
      description: "",
      dueDate: undefined,
    },
  });

  useEffect(() => {
    if (open) {
      if (debt) {
        form.reset({
          amount: Number(debt.amount),
          type: debt.type as "payable" | "receivable",
          contactId: debt.contactId,
          description: debt.description ?? "",
          dueDate: debt.dueDate ? new Date(debt.dueDate).toISOString().slice(0, 10) : "",
        });
        setActiveTab(debt.type as "payable" | "receivable");
      } else {
        form.reset({
          type: "receivable",
          amount: 0,
          contactId: "",
          description: "",
          dueDate: undefined,
        });
        setActiveTab("receivable");
      }
    }
  }, [open, debt, form]);

  const mutation = useMutation({
    mutationFn: async (data: DebtFormValues) => {
      const formattedData = {
        ...data,
        dueDate: data.dueDate || undefined,
      };

      if (debt?.id) {
        return updateDebt(debt.id, {
          description: formattedData.description,
          dueDate: formattedData.dueDate,
        });
      }
      return createDebt(formattedData);
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(debt ? dict.toasts.updated : dict.toasts.created);
        queryClient.invalidateQueries({ queryKey: ["debts"] });
        router.refresh();
        form.reset();
        onOpenChange(false);
      } else {
        toast.error(data.error || (debt ? dict.toasts.update_failed : dict.toasts.create_failed));
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || dict.toasts.update_failed);
    },
  });

  async function onSubmit(data: DebtFormValues) {
    setIsLoading(true);
    await mutation.mutateAsync(data).finally(() => setIsLoading(false));
  }

  const handleTabChange = (value: "payable" | "receivable") => {
    setActiveTab(value);
    form.setValue("type", value);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[540px]">
        <SheetHeader className="flex shrink-0 flex-row items-center justify-between border-b bg-muted/5 px-6 py-6 text-left">
          <SheetTitle className="font-normal font-serif text-xl">
            {debt ? dict.form.edit_title : dict.form.add_title}
          </SheetTitle>
        </SheetHeader>

        <div className="no-scrollbar flex-1 overflow-y-auto px-6 py-6">
          <Form {...form}>
            <form id="debt-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {!debt && (
                <FormSegmentedTabs
                  value={activeTab}
                  onChange={handleTabChange}
                  options={[
                    { value: "receivable", label: dict.form.type_receivable },
                    { value: "payable", label: dict.form.type_payable },
                  ]}
                  className="h-11 bg-muted/20 p-1"
                  triggerClassName="font-medium text-[10px] uppercase tracking-widest"
                />
              )}

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                      {dict.form.amount.label}
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
                            "rounded-none border-border bg-transparent pl-14 font-normal font-serif text-2xl tracking-tight focus:border-foreground",
                            activeTab === "payable" ? "text-rose-500" : "text-emerald-500",
                          )}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-[11px]">{dict.form.amount.description}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contactId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                        {dict.form.contact.label}
                      </FormLabel>
                      <FormControl>
                        <SelectContact
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={dict.form.contact.placeholder}
                          className="h-10 w-full justify-start rounded-none border-border bg-transparent px-3 text-left focus:border-foreground"
                        />
                      </FormControl>
                      <FormDescription className="text-[10px] uppercase tracking-wider opacity-60">
                        {dict.form.contact.description}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem className="">
                      <FormLabel className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                        {dict.form.due_date.label}
                      </FormLabel>
                      <FormControl>
                        <InputDate
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder={dict.form.due_date.placeholder}
                          className="h-10 rounded-none"
                        />
                      </FormControl>
                      <FormDescription className="text-[10px] uppercase tracking-wider opacity-60">
                        {dict.form.due_date.description}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                      {dict.form.notes.label}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={dict.form.notes.placeholder}
                        {...field}
                        className="h-10 rounded-none border-border bg-transparent focus:border-foreground"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        <div className="mt-auto flex shrink-0 gap-3 border-t bg-background p-6">
          <Button
            variant="outline"
            type="button"
            className="h-12 flex-1 rounded-none font-medium text-xs uppercase tracking-widest"
            onClick={() => onOpenChange(false)}
          >
            {dict.form.cancel}
          </Button>
          <Button
            form="debt-form"
            type="submit"
            className="h-12 flex-1 rounded-none font-medium text-xs uppercase tracking-widest"
            disabled={isLoading}
          >
            {isLoading ? dict.form.saving : dict.form.submit}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
