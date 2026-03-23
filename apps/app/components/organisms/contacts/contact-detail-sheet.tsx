"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
  Badge,
  cn,
} from "@workspace/ui";
import {
  deleteContact,
  updateContact,
  getDebts,
  type DebtWithContact,
} from "@workspace/modules/client";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { Contact } from "@workspace/types";
import {
  History,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Trash,
} from "lucide-react";
import { useAppStore } from "@/stores/app";
import { format } from "date-fns";
import { useConfirm } from "@/components/providers/confirm-modal-provider";
import { BulkPaySheet } from "../debts/bulk-pay-sheet";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  addressLine1: z.string().optional().or(z.literal("")),
  note: z.string().optional().or(z.literal("")),
});

interface Props {
  contact: Contact | null;
  open: boolean;
  onClose: () => void;
  onDebtClick?: (debt: DebtWithContact) => void;
  dictionary: any;
}

export function ContactDetailSheet({
  contact,
  open,
  onClose,
  onDebtClick,
  dictionary,
}: Props) {
  const queryClient = useQueryClient();
  const { settings, formatCurrency } = useAppStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isBulkPayOpen, setIsBulkPayOpen] = useState(false);
  const confirm = useConfirm();

  const { data: debts, isLoading: debtsLoading } = useQuery({
    queryKey: ["debts", "contact", contact?.id],
    queryFn: async () => {
      if (!contact?.id) return [];
      const result = await getDebts({ contactId: contact.id });
      return result.success ? result.data : [];
    },
    enabled: !!contact?.id && open,
  });

  const form = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema as any),
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
    mutationFn: (values: z.infer<typeof contactSchema>) =>
      updateContact(contact!.id, {
        name: values.name,
        email: values.email || undefined,
        phone: values.phone || undefined,
        addressLine1: values.addressLine1 || undefined,
        note: values.note || undefined,
      }),
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
    mutationFn: () => deleteContact(contact!.id),
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

  const address = [
    contact.addressLine1,
    contact.city,
    contact.state,
    contact.country,
  ]
    .filter(Boolean)
    .join(", ");

  const totalReceivable =
    debts
      ?.filter((d) => d.type === "receivable")
      .reduce(
        (acc, d) => acc + Number.parseFloat(d.remainingAmount as string),
        0,
      ) || 0;
  const totalPayable =
    debts
      ?.filter((d) => d.type === "payable")
      .reduce(
        (acc, d) => acc + Number.parseFloat(d.remainingAmount as string),
        0,
      ) || 0;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[540px] flex flex-col h-full p-0 rounded-none shadow-none border-l">
        <SheetHeader className="p-6 pb-6 border-b shrink-0 bg-muted/5 flex flex-row items-center justify-between space-y-0 text-left">
          <div className="space-y-1">
            <SheetTitle className="text-xl font-serif font-normal">
              {contact.name}
            </SheetTitle>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              {contact.email || dictionary.contacts.details.no_email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-none h-8 text-[10px] uppercase tracking-widest font-medium"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing
                ? dictionary.contacts.details.view_details
                : dictionary.contacts.details.quick_edit}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: dictionary.contacts.details.delete_confirm_title,
                  description: dictionary.contacts.details.delete_confirm_desc,
                  confirmLabel: dictionary.contacts.form.cancel.delete || "Delete",
                  cancelLabel: dictionary.contacts.form.cancel,
                  destructive: true,
                });
                if (ok) deleteMutation.mutate();
              }}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          {isEditing ? (
            <div className="p-6">
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))}
                  className="space-y-6"
                >
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                          {dictionary.contacts.form.name_label}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="rounded-none h-10 bg-transparent"
                          />
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
                        <FormLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                          {dictionary.contacts.form.email_label}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            className="rounded-none h-10 bg-transparent"
                          />
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
                          <FormLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                            {dictionary.contacts.form.phone_label}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="rounded-none h-10 bg-transparent"
                            />
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
                          <FormLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                            {dictionary.contacts.form.address_label}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="rounded-none h-10 bg-transparent"
                            />
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
                        <FormLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                          {dictionary.contacts.form.notes_label}
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            className="min-h-[100px] rounded-none bg-transparent resize-none"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full rounded-none h-12 uppercase tracking-widest font-medium text-xs"
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending
                      ? dictionary.contacts.form.saving
                      : dictionary.contacts.form.save}
                  </Button>
                </form>
              </Form>
            </div>
          ) : (
            <div>
              {/* Profile Details Bar */}
              <div className="p-6 grid grid-cols-2 gap-6 bg-muted/5 border-b border-border/50">
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    {dictionary.contacts.form.phone_label}
                  </p>
                  <p className="text-sm">{contact.phone || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    {dictionary.contacts.form.address_label}
                  </p>
                  <p className="text-sm truncate">{address || "—"}</p>
                </div>
              </div>

              {/* Debt Summary Bar */}
              <div className="p-6 grid grid-cols-2 gap-6 border-b border-border/50">
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    {dictionary.debts.summary.receivable}
                  </p>
                  <p className="text-2xl font-serif text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(totalReceivable)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    {dictionary.debts.summary.payable}
                  </p>
                  <p className="text-2xl font-serif text-rose-600 dark:text-rose-400">
                    {formatCurrency(totalPayable)}
                  </p>
                </div>
              </div>

              {/* History Section */}
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <History className="h-3 w-3" />
                    {dictionary.contacts.details.activity_history}
                  </h3>
                  {debts && debts.filter((d) => d.status !== "paid").length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-3 text-[10px] uppercase tracking-widest rounded-none font-medium"
                      onClick={() => setIsBulkPayOpen(true)}
                    >
                      {dictionary.debts.details.settle_all}
                    </Button>
                  )}
                </div>

                {debtsLoading ? (
                  <div className="space-y-6 pl-4">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-16 bg-muted/10 animate-pulse rounded-none border border-border/50"
                      />
                    ))}
                  </div>
                ) : debts && debts.length > 0 ? (
                  <div className="relative">
                    {debts.map((debt, index) => {
                      const amount = Number.parseFloat(debt.amount as string);
                      const remaining = Number.parseFloat(
                        debt.remainingAmount as string,
                      );
                      const isReceivable = debt.type === "receivable";
                      const isLast = index === debts.length - 1;

                      return (
                        <div key={debt.id} className="relative flex gap-4">
                          {/* Timeline spine */}
                          <div className="flex flex-col items-center shrink-0 w-6">
                            {/* Dot */}
                            <div
                              className={cn(
                                "mt-1 h-2.5 w-2.5 rounded-full border-2 shrink-0 z-10",
                                isReceivable
                                  ? "bg-emerald-500 border-emerald-500"
                                  : "bg-rose-500 border-rose-500",
                                debt.status === "paid" && "opacity-40",
                              )}
                            />
                            {/* Vertical line (hidden for last item) */}
                            {!isLast && (
                              <div className="flex-1 w-px bg-border/60 mt-1" />
                            )}
                          </div>

                          {/* Content */}
                          <div
                            className={cn(
                              "flex-1 min-w-0 pb-6",
                              isLast && "pb-0",
                              onDebtClick && "cursor-pointer",
                            )}
                            onClick={() => onDebtClick?.(debt)}
                          >
                            {/* Header row: label + badge + date */}
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "text-[10px] font-medium uppercase tracking-widest",
                                    isReceivable
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-rose-600 dark:text-rose-400",
                                  )}
                                >
                                  {isReceivable
                                    ? dictionary.debts.summary.receivable
                                    : dictionary.debts.summary.payable}
                                </span>
                                <Badge
                                  variant={
                                    debt.status === "paid"
                                      ? "default"
                                      : "outline"
                                  }
                                  className="h-4 px-1.5 text-[9px] uppercase font-medium tracking-widest rounded-none shadow-none"
                                >
                                  {debt.status}
                                </Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {format(
                                  new Date(debt.createdAt),
                                  "MMM d, yyyy",
                                )}
                              </span>
                            </div>

                            {/* Amount */}
                            <p
                              className={cn(
                                "text-lg font-serif tracking-tight font-normal leading-none",
                                debt.status === "paid" &&
                                  "text-muted-foreground line-through opacity-60",
                              )}
                            >
                              {formatCurrency(amount)}
                            </p>

                            {/* Description */}
                            {debt.description && (
                              <p className="mt-1 text-[11px] text-muted-foreground italic opacity-70 truncate">
                                {debt.description}
                              </p>
                            )}

                            {/* Partial progress bar */}
                            {remaining > 0 && remaining < amount && (
                              <div className="mt-2 space-y-1">
                                <div className="h-0.5 w-full bg-muted rounded-none overflow-hidden">
                                  <div
                                    className="h-full bg-primary transition-all"
                                    style={{
                                      width: `${((amount - remaining) / amount) * 100}%`,
                                    }}
                                  />
                                </div>
                                <div className="flex justify-between items-center">
                                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                                    {dictionary.contacts.details.progress}
                                  </p>
                                  <p className="text-[9px] font-medium text-primary">
                                    {formatCurrency(amount - remaining)}{" "}
                                    {dictionary.contacts.details.settled}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-40 flex flex-col items-center justify-center border border-dashed border-border/50 bg-muted/5 p-8 text-center rounded-none">
                    <History className="h-8 w-8 text-muted-foreground/30 mb-3" />
                    <p className="text-xs text-muted-foreground uppercase tracking-widest">
                      {dictionary.contacts.details.no_history}
                    </p>
                  </div>
                )}
              </div>

              {contact.note && (
                <div className="p-6 pt-0 space-y-2">
                  <h3 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    {dictionary.contacts.details.notes}
                  </h3>
                  <div className="text-[11px] text-muted-foreground border border-border/50 p-4 italic bg-muted/5">
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
