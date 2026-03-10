"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod/v3";
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
  Separator,
} from "@workspace/ui";
import { deleteCustomer, updateCustomer } from "@workspace/modules/client";
import { useQueryClient } from "@tanstack/react-query";
import type { Customer } from "@workspace/types";
import { Globe, Mail, MapPin, Phone, Trash2, User } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

const formSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  note: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

export function CustomerDetailSheet({ customer, open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      note: customer?.note ?? "",
    },
  });

  // Reset form when customer changes
  useEffect(() => {
    if (customer) {
      form.reset({
        name: customer.name,
        email: customer.email,
        phone: customer.phone ?? "",
        note: customer.note ?? "",
      });
    }
  }, [customer, form]);

  const watchedValues = form.watch();
  const debouncedValues = useDebounce(watchedValues, 800);

  useEffect(() => {
    if (!customer || !form.formState.isDirty) return;

    const save = async () => {
      const isValid = await form.trigger();
      if (!isValid) return;

      const result = await updateCustomer(customer.id, {
        name: debouncedValues.name,
        email: debouncedValues.email,
        phone: debouncedValues.phone || null,
        note: debouncedValues.note || null,
      });

      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
      }
    };

    save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValues]);

  const handleDelete = async () => {
    if (!customer) return;
    if (!confirm(`Delete ${customer.name}? This cannot be undone.`)) return;
    setIsDeleting(true);
    try {
      const result = await deleteCustomer(customer.id);
      if (result.success) {
        toast.success("Customer deleted");
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        onClose();
      } else {
        toast.error(result.error || "Failed to delete customer");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!customer) return null;

  const address = [
    customer.addressLine1,
    customer.addressLine2,
    customer.city,
    customer.state,
    customer.zip,
    customer.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[480px] overflow-y-auto p-0">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-xl">{customer.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">{customer.email}</p>
        </SheetHeader>

        <Separator />

        <div className="p-6 space-y-6">
          {/* Editable quick fields */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Quick Edit
            </p>
            <Form {...form}>
              <form className="space-y-3">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground font-normal">
                        Name
                      </FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                      <FormLabel className="text-xs text-muted-foreground font-normal">
                        Email
                      </FormLabel>
                      <FormControl>
                        <Input {...field} type="email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground font-normal">
                        Phone
                      </FormLabel>
                      <FormControl>
                        <Input {...field} type="tel" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground font-normal">
                        Note
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[70px] resize-none"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>

          <Separator />

          {/* Read-only info */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Details
            </p>
            <div className="space-y-3">
              <InfoRow
                icon={User}
                label="Contact Person"
                value={customer.contact}
              />
              <InfoRow icon={Globe} label="Website" value={customer.website} />
              <InfoRow
                icon={MapPin}
                label="Address"
                value={address || undefined}
              />
              <InfoRow
                icon={Phone}
                label="VAT Number"
                value={customer.vatNumber}
              />
            </div>
            {!customer.contact &&
              !customer.website &&
              !address &&
              !customer.vatNumber && (
                <p className="text-sm text-muted-foreground">
                  No additional details
                </p>
              )}
          </div>

          <Separator />

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Danger Zone
            </p>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isDeleting ? "Deleting..." : "Delete Customer"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
