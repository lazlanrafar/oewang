"use client";

import { useEffect, useMemo, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
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

import { FormSegmentedTabs } from "@/components/molecules/form-segmented-tabs";
import { SelectContact } from "@/components/molecules/select-contact";

const getDebtSchema = (dictionary: Dictionary["debts"]) =>
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
  canEdit?: boolean;
}

export function DebtFormSheet({
  open,
  onOpenChange,
  debt,
  dictionary,
  settings,
  canEdit = true,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"payable" | "receivable">(debt?.type ?? "receivable");
  const currencyUnit = getCurrencyDisplayUnit(settings?.mainCurrencyCode, settings?.mainCurrencySymbol);
  const queryClient = useQueryClient();
  const dict = dictionary.debts;

  useEffect(() => {
    setMounted(true);
  }, []);

  const schema = useMemo(() => getDebtSchema(dict), [dict]);

  const form = useForm<DebtFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "receivable",
      amount: 0,
      contactId: "",
      description: "",
      dueDate: undefined,
    },
  });

  // Reset on open / when entity hydrates
  useEffect(() => {
    if (!open) return;
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
  }, [open, debt, form]);

  if (!mounted || !canEdit) return null;

  async function onSubmit(data: DebtFormValues) {
    setIsLoading(true);
    try {
      const payload = { ...data, dueDate: data.dueDate || undefined };

      const result = debt?.id
        ? await updateDebt(debt.id, {
            description: payload.description,
            dueDate: payload.dueDate,
          })
        : await createDebt(payload);

      if (!result.success) {
        throw new Error(result.error || (debt ? dict.toasts.update_failed : dict.toasts.create_failed));
      }

      toast.success(debt ? dict.toasts.updated : dict.toasts.created);

      // Optimistic cache patch on update — covers infinite + regular query shapes
      if (debt && result.data) {
        const updated = { ...debt, ...result.data } as DebtWithContact;
        queryClient.setQueriesData<any>({ queryKey: ["debts"], exact: false }, (old: any) => {
          if (!old) return old;
          if ("pages" in old && Array.isArray(old.pages)) {
            return {
              ...old,
              pages: old.pages.map((page: any) => ({
                ...page,
                data: (page.data ?? []).map((d: DebtWithContact) =>
                  d.id === updated.id ? { ...d, ...updated } : d,
                ),
              })),
            };
          }
          if ("data" in old && Array.isArray(old.data)) {
            return {
              ...old,
              data: old.data.map((d: DebtWithContact) =>
                d.id === updated.id ? { ...d, ...updated } : d,
              ),
            };
          }
          return old;
        });
      }

      form.reset();
      onOpenChange(false);

      // Background reconciliation — picks up new debts (server assigns id/contactName) and recomputes derived fields
      void queryClient.invalidateQueries({ queryKey: ["debts"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : dict.toasts.update_failed);
    } finally {
      setIsLoading(false);
    }
  }

  const handleTabChange = (value: "payable" | "receivable") => {
    setActiveTab(value);
    form.setValue("type", value);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col p-0">
        <SheetHeader className="shrink-0 px-6 pt-6">
          <SheetTitle className="text-lg">
            {debt ? dict.form.edit_title : dict.form.add_title}
          </SheetTitle>
        </SheetHeader>

        <div className="no-scrollbar flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
          <Form {...form}>
            <form id="debt-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {!debt && (
                <FormSegmentedTabs
                  value={activeTab}
                  onChange={handleTabChange}
                  options={[
                    { value: "receivable", label: dict.form.type_receivable },
                    { value: "payable", label: dict.form.type_payable },
                  ]}
                />
              )}

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-normal text-muted-foreground text-xs">
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
                            "bg-transparent pl-14 font-medium text-sm transition-colors focus:border-foreground",
                            activeTab === "payable" ? "text-rose-500" : "text-emerald-500",
                          )}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>{dict.form.amount.description}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contactId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-normal text-muted-foreground text-xs">
                        {dict.form.contact.label}
                      </FormLabel>
                      <FormControl>
                        <SelectContact
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={dict.form.contact.placeholder}
                          className="w-full justify-start bg-transparent px-3 text-left focus:border-foreground"
                        />
                      </FormControl>
                      <FormDescription>{dict.form.contact.description}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-normal text-muted-foreground text-xs">
                        {dict.form.due_date.label}
                      </FormLabel>
                      <FormControl>
                        <InputDate
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder={dict.form.due_date.placeholder}
                        />
                      </FormControl>
                      <FormDescription>{dict.form.due_date.description}</FormDescription>
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
                    <FormLabel className="font-normal text-muted-foreground text-xs">
                      {dict.form.notes.label}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={dict.form.notes.placeholder}
                        autoComplete="off"
                        {...field}
                        className="bg-transparent focus:border-foreground"
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
            form="debt-form"
            type="submit"
            className="w-full"
            disabled={isLoading || !form.formState.isDirty}
          >
            {isLoading ? dict.form.saving : dict.form.submit}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
