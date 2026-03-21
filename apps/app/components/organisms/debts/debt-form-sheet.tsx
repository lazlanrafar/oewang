"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type DebtWithContact,
  createDebt,
  updateDebt,
} from "@workspace/modules/client";
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
  Input,
  InputDate,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui";
import { SelectContact } from "@/components/molecules/select-contact";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/stores/app";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

const debtSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  contactId: z.string().min(1, "Contact is required"),
  type: z.enum(["payable", "receivable"]),
  description: z.string().optional(),
  dueDate: z.string().optional(),
});

type DebtFormValues = z.infer<typeof debtSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt?: DebtWithContact;
  dictionary: any;
}

export function DebtFormSheet({ open, onOpenChange, debt, dictionary }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DebtFormValues["type"]>(
    (debt?.type as DebtFormValues["type"]) || "receivable",
  );
  const { settings } = useAppStore();

  const form = useForm<DebtFormValues>({
    resolver: zodResolver(debtSchema as any),
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
          dueDate: debt.dueDate
            ? new Date(debt.dueDate).toISOString().slice(0, 10)
            : "",
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
      } else {
        return createDebt(formattedData);
      }
    },
    onSuccess: (data: any) => {
      if (data?.success) {
        toast.success(
          debt
            ? dictionary.debts.form.update_success
            : dictionary.debts.form.create_success,
        );
        queryClient.invalidateQueries({ queryKey: ["debts"] });
        router.refresh();
        form.reset();
        onOpenChange(false);
      } else {
        toast.error(
          data?.error ||
            (debt ? "Failed to update debt" : "Failed to create debt"),
        );
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save debt");
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
      <SheetContent className="flex flex-col h-full p-0 rounded-none shadow-none border-l sm:max-w-[540px]">
        <SheetHeader className="px-6 py-6 border-b shrink-0 flex flex-row items-center justify-between bg-muted/5 text-left">
          <SheetTitle className="font-serif text-xl font-normal">
            {debt
              ? dictionary.debts.form.update_title || "Edit Debt"
              : dictionary.debts.form.new_title || "New Debt"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar">
          <Form {...form}>
            <form
              id="debt-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-8"
            >
              {!debt && (
                <Tabs
                  defaultValue={activeTab}
                  onValueChange={(value) =>
                    handleTabChange(value as "payable" | "receivable")
                  }
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2 rounded-none h-11 p-1 bg-muted/20">
                    <TabsTrigger value="receivable" className="rounded-none data-[state=active]:bg-background data-[state=active]:shadow-none uppercase text-[10px] font-medium tracking-widest">
                      {dictionary.debts.form.type.receivable}
                    </TabsTrigger>
                    <TabsTrigger value="payable" className="rounded-none data-[state=active]:bg-background data-[state=active]:shadow-none uppercase text-[10px] font-medium tracking-widest">
                      {dictionary.debts.form.type.payable}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      {dictionary.debts.form.amount.label}
                    </FormLabel>
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
                            "pl-8 text-2xl bg-transparent rounded-none border-border focus:border-foreground font-serif tracking-tight font-normal",
                            activeTab === "payable"
                              ? "text-rose-500"
                              : "text-emerald-500",
                          )}
                        />
                      </div>
                    </FormControl>
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
                      <FormLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                        {dictionary.debts.form.contact.label}
                      </FormLabel>
                      <FormControl>
                        <SelectContact
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={
                            dictionary.debts.form.contact.placeholder
                          }
                          className="bg-transparent rounded-none border-border focus:border-foreground w-full justify-start text-left px-3 h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem className="">
                      <FormLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                        {dictionary.debts.form.due_date.label}
                      </FormLabel>
                      <FormControl>
                        <InputDate
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder={
                            dictionary.debts.form.due_date.placeholder
                          }
                          className="rounded-none h-10"
                        />
                      </FormControl>
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
                    <FormLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      {dictionary.debts.form.description.label}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          dictionary.debts.form.description.placeholder
                        }
                        {...field}
                        className="bg-transparent rounded-none border-border focus:border-foreground h-10"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        <div className="p-6 border-t bg-background shrink-0 mt-auto flex gap-3">
          <Button
            variant="outline"
            type="button"
            className="flex-1 rounded-none h-12 uppercase tracking-widest font-medium text-xs"
            onClick={() => onOpenChange(false)}
          >
            {dictionary.debts.form.cancel}
          </Button>
          <Button
            form="debt-form"
            type="submit"
            className="flex-1 rounded-none h-12 uppercase tracking-widest font-medium text-xs"
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : dictionary.debts.form.submit}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
