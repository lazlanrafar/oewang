"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { type DebtWithContact, deleteContact, getDebts, updateContact } from "@workspace/modules/client";
import type { Contact, TransactionSettings } from "@workspace/types";
import {
  Badge,
  Button,
  cn,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Textarea,
} from "@workspace/ui";
import { formatCurrency as formatCurrencyUtil } from "@workspace/utils";
import { format } from "date-fns";
import { History, Trash } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { useConfirm } from "@/components/providers/confirm-modal-provider";

import { BulkPaySheet } from "../debts/bulk-pay-sheet";

const getContactSchema = (dictionary: Dictionary) =>
  z.object({
    name: z.string().min(1, dictionary.contacts?.errors?.name_required || "Name is required"),
    email: z
      .string()
      .email(dictionary.contacts?.errors?.invalid_email || "Invalid email")
      .optional()
      .or(z.literal("")),
    phone: z.string().optional().or(z.literal("")),
    addressLine1: z.string().optional().or(z.literal("")),
    note: z.string().optional().or(z.literal("")),
  });
interface Props {
  contact: Contact | null;
  open: boolean;
  onClose: () => void;
  onDebtClick?: (debt: DebtWithContact) => void;
  dictionary: Dictionary;
  settings: TransactionSettings;
}

export function ContactDetailSheet({ contact, open, onClose, onDebtClick, dictionary, settings }: Props) {
  const queryClient = useQueryClient();
  const formatCurrency = (amount: number, options?: Parameters<typeof formatCurrencyUtil>[2]) =>
    formatCurrencyUtil(amount, settings, options);
  const [isEditing, setIsEditing] = useState(false);
  const [isBulkPayOpen, setIsBulkPayOpen] = useState(false);
  const confirm = useConfirm();

  // Defensive date formatter
  const formatDate = (date: string | null | undefined) => {
    if (!date) return "–";
    try {
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) return "–";
      return format(d, "MMM d, yyyy");
    } catch {
      return "–";
    }
  };

  const { data: debts, isLoading: debtsLoading } = useQuery({
    queryKey: ["debts", "contact", contact?.id],
    queryFn: async () => {
      if (!contact?.id) return [];
      const result = await getDebts({ contactId: contact.id! });
      return result.success ? result.data : [];
    },
    enabled: !!contact?.id && open,
  });

  const form = useForm<z.infer<ReturnType<typeof getContactSchema>>>({
    resolver: zodResolver(getContactSchema(dictionary)),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      addressLine1: "",
      note: "",
    },
  });

  useEffect(() => {
    if (contact && open) {
      form.reset({
        name: contact.name,
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        addressLine1: contact.addressLine1 ?? "",
        note: contact.note ?? "",
      });
      setIsEditing(false);
    }
  }, [contact, open, form]);

  const updateMutation = useMutation({
    mutationFn: (values: z.infer<ReturnType<typeof getContactSchema>>) => {
      if (!contact?.id) throw new Error("Contact ID is missing");
      return updateContact(contact.id, {
        name: values.name,
        email: values.email || undefined,
        phone: values.phone || undefined,
        addressLine1: values.addressLine1 || undefined,
        note: values.note || undefined,
      });
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(dictionary.contacts.toasts.updated);
        queryClient.invalidateQueries({ queryKey: ["contacts"] });
        setIsEditing(false);
      } else {
        toast.error(res.error || dictionary.contacts.toasts.update_failed);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!contact?.id) throw new Error("Contact ID is missing");
      return deleteContact(contact.id);
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(dictionary.contacts.toasts.deleted);
        queryClient.invalidateQueries({ queryKey: ["contacts"] });
        onClose();
      } else {
        toast.error(res.error || dictionary.contacts.toasts.delete_failed);
      }
    },
  });

  if (!contact) return null;

  const address = [contact.addressLine1, contact.city, contact.state, contact.country].filter(Boolean).join(", ");

  const totalReceivable =
    (debts || [])
      .filter((d) => d.type === "receivable")
      .reduce((acc, d) => acc + (Number.parseFloat((d.remainingAmount ?? 0) as string) || 0), 0) || 0;
  const totalPayable =
    (debts || [])
      .filter((d) => d.type === "payable")
      .reduce((acc, d) => acc + (Number.parseFloat((d.remainingAmount ?? 0) as string) || 0), 0) || 0;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[540px]">
        <SheetHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 border-b bg-muted/5 p-6 pb-6 text-left">
          <div className="space-y-1">
            <SheetTitle className="font-normal font-serif text-xl">{contact.name}</SheetTitle>
            <p className="text-muted-foreground text-xs uppercase tracking-widest">
              {contact.email || dictionary.contacts.details.no_email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-none font-medium text-[10px] uppercase tracking-widest"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? dictionary.contacts.details.view_details : dictionary.contacts.details.quick_edit}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: dictionary.contacts.details.delete_confirm_title,
                  description: dictionary.contacts.details.delete_confirm_desc,
                  confirmLabel: dictionary.common.delete,
                  cancelLabel: dictionary.common.cancel,
                  destructive: true,
                });
                if (ok) deleteMutation.mutate();
              }}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="no-scrollbar flex-1 overflow-y-auto">
          {isEditing ? (
            <div className="p-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                          {dictionary.contacts.form.name_label}
                        </FormLabel>
                        <FormControl>
                          <Input {...field} className="h-10 rounded-none bg-transparent" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                          {dictionary.contacts.form.email_label}
                        </FormLabel>
                        <FormControl>
                          <Input {...field} type="email" className="h-10 rounded-none bg-transparent" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                            {dictionary.contacts.form.phone_label}
                          </FormLabel>
                          <FormControl>
                            <Input {...field} className="h-10 rounded-none bg-transparent" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="addressLine1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                            {dictionary.contacts.form.address_label}
                          </FormLabel>
                          <FormControl>
                            <Input {...field} className="h-10 rounded-none bg-transparent" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                          {dictionary.contacts.form.notes_label}
                        </FormLabel>
                        <FormControl>
                          <Textarea {...field} className="min-h-[100px] resize-none rounded-none bg-transparent" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="h-12 w-full rounded-none font-medium text-xs uppercase tracking-widest"
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? dictionary.contacts.form.saving : dictionary.contacts.form.save}
                  </Button>
                </form>
              </Form>
            </div>
          ) : (
            <div>
              {/* Profile Details Bar */}
              <div className="grid grid-cols-2 gap-6 border-border/50 border-b bg-muted/5 p-6">
                <div className="space-y-1">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                    {dictionary.contacts.form.phone_label}
                  </p>
                  <p className="text-sm">{contact.phone || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                    {dictionary.contacts.form.address_label}
                  </p>
                  <p className="truncate text-sm">{address || "—"}</p>
                </div>
              </div>

              {/* Debt Summary Bar */}
              <div className="grid grid-cols-2 gap-6 border-border/50 border-b p-6">
                <div className="space-y-1">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                    {dictionary.debts.types.receivable}
                  </p>
                  <p className="font-serif text-2xl text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(totalReceivable)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                    {dictionary.debts.types.payable}
                  </p>
                  <p className="font-serif text-2xl text-rose-600 dark:text-rose-400">{formatCurrency(totalPayable)}</p>
                </div>
              </div>

              {/* History Section */}
              <div className="space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                    <History className="h-3 w-3" />
                    {dictionary.contacts.details.activity_history}
                  </h3>
                  {debts && debts.filter((d) => d.status !== "paid").length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 rounded-none px-3 font-medium text-[10px] uppercase tracking-widest"
                      onClick={() => setIsBulkPayOpen(true)}
                    >
                      {dictionary.debts.details.settle_all}
                    </Button>
                  )}
                </div>

                {debtsLoading ? (
                  <div className="space-y-6 pl-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 animate-pulse rounded-none border border-border/50 bg-muted/10" />
                    ))}
                  </div>
                ) : debts && debts.length > 0 ? (
                  <div className="relative">
                    {debts.map((debt, index) => {
                      const amount = Number.parseFloat((debt.amount ?? 0) as string) || 0;
                      const remaining = Number.parseFloat((debt.remainingAmount ?? 0) as string) || 0;
                      const isReceivable = debt.type === "receivable";
                      const isLast = index === debts.length - 1;

                      return (
                        <div key={debt.id} className="relative flex gap-4">
                          {/* Timeline spine */}
                          <div className="flex w-6 shrink-0 flex-col items-center">
                            {/* Dot */}
                            <div
                              className={cn(
                                "z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2",
                                isReceivable ? "border-emerald-500 bg-emerald-500" : "border-rose-500 bg-rose-500",
                                debt.status === "paid" && "opacity-40",
                              )}
                            />
                            {/* Vertical line (hidden for last item) */}
                            {!isLast && <div className="mt-1 w-px flex-1 bg-border/60" />}
                          </div>

                          {/* Content */}
                          <button
                            type="button"
                            className={cn("min-w-0 flex-1 pb-6", isLast && "pb-0", onDebtClick && "cursor-pointer")}
                            onClick={onDebtClick ? () => onDebtClick(debt) : undefined}
                            onKeyDown={
                              onDebtClick
                                ? (event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      onDebtClick(debt);
                                    }
                                  }
                                : undefined
                            }
                          >
                            {/* Header row: label + badge + date */}
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "font-medium text-[10px] uppercase tracking-widest",
                                    isReceivable
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-rose-600 dark:text-rose-400",
                                  )}
                                >
                                  {isReceivable
                                    ? dictionary.debts.types.receivable
                                    : dictionary.debts.types.payable}
                                </span>
                                <Badge
                                  variant={debt.status === "paid" ? "default" : "outline"}
                                  className="h-4 rounded-none px-1.5 font-medium text-[9px] uppercase tracking-widest shadow-none"
                                >
                                  {debt.status}
                                </Badge>
                              </div>
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {formatDate(debt.createdAt)}
                              </span>
                            </div>

                            {/* Amount */}
                            <p
                              className={cn(
                                "font-normal font-serif text-lg leading-none tracking-tight",
                                debt.status === "paid" && "text-muted-foreground line-through opacity-60",
                              )}
                            >
                              {formatCurrency(amount)}
                            </p>

                            {/* Description */}
                            {debt.description && (
                              <p className="mt-1 truncate text-[11px] text-muted-foreground italic opacity-70">
                                {debt.description}
                              </p>
                            )}

                            {/* Partial progress bar */}
                            {remaining > 0 && remaining < amount && (
                              <div className="mt-2 space-y-1">
                                <div className="h-0.5 w-full overflow-hidden rounded-none bg-muted">
                                  <div
                                    className="h-full bg-primary transition-all"
                                    style={{
                                      width: `${((amount - remaining) / amount) * 100}%`,
                                    }}
                                  />
                                </div>
                                <div className="flex items-center justify-between">
                                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest">
                                    {dictionary.contacts.details.progress}
                                  </p>
                                  <p className="font-medium text-[9px] text-primary">
                                    {formatCurrency(amount - remaining)} {dictionary.contacts.details.settled}
                                  </p>
                                </div>
                              </div>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center rounded-none border border-border/50 border-dashed bg-muted/5 p-8 text-center">
                    <History className="mb-3 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-muted-foreground text-xs uppercase tracking-widest">
                      {dictionary.contacts.details.no_history}
                    </p>
                  </div>
                )}
              </div>

              {contact.note && (
                <div className="space-y-2 p-6 pt-0">
                  <h3 className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                    {dictionary.contacts.details.notes}
                  </h3>
                  <div className="border border-border/50 bg-muted/5 p-4 text-[11px] text-muted-foreground italic">
                    {contact.note}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>

      {/* Bulk Pay — rendered outside SheetContent to avoid nesting Sheet portals */}
      <BulkPaySheet
        open={isBulkPayOpen}
        onOpenChange={setIsBulkPayOpen}
        debts={debts ?? []}
        contactName={contact.name}
        dictionary={dictionary}
      />
    </Sheet>
  );
}
