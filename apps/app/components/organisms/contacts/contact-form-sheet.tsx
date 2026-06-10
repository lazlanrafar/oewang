"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { createContact, updateContact } from "@workspace/modules/client";
import type { Contact } from "@workspace/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
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
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const getContactSchema = (dictionary: Dictionary) =>
  z.object({
    name: z
      .string()
      .min(1, dictionary.contacts?.errors?.name_required || "Name is required")
      .max(200),
    email: z.string().email(dictionary.contacts?.errors?.invalid_email || "Invalid email"),
    phone: z.string().optional(),
    website: z.string().optional(),
    contact: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    zip: z.string().optional(),
    note: z.string().optional(),
    vatNumber: z.string().optional(),
  });

type FormValues = z.infer<ReturnType<typeof getContactSchema>>;

interface Props {
  open: boolean;
  onClose: () => void;
  contact?: Contact | null;
  dictionary: Dictionary;
  canEdit?: boolean;
}

/** Simple email tag-chip input — no extra dependency needed */
function BillingEmailsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (emails: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addEmail = (raw: string) => {
    const emails = raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !value.includes(e));
    if (emails.length) onChange([...value, ...emails]);
    setInputValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEmail(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) addEmail(inputValue);
  };

  const removeEmail = (email: string) => {
    onChange(value.filter((e) => e !== email));
  };

  return (
    <label
      htmlFor="billing-emails-input"
      className="flex min-h-9 w-full cursor-text flex-wrap gap-1.5 border border-input bg-transparent px-3 py-1.5 text-sm"
      onClick={() => inputRef.current?.focus()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          inputRef.current?.focus();
        }
      }}
    >
      {value.map((email) => (
        <Badge
          key={email}
          variant="secondary"
          className="flex items-center gap-1 py-0.5 pr-1 pl-2 font-normal text-xs"
        >
          {email}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeEmail(email);
            }}
            className="ml-0.5 rounded-sm p-0.5 hover:bg-muted-foreground/20"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        id="billing-emails-input"
        ref={inputRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? "email@example.com" : ""}
        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
      />
    </label>
  );
}

export function ContactFormSheet({ open, onClose, contact, dictionary, canEdit = true }: Props) {
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [billingEmails, setBillingEmails] = useState<string[]>([]);
  const [billingEmailsDirty, setBillingEmailsDirty] = useState(false);
  const queryClient = useQueryClient();
  const isEdit = !!contact;

  useEffect(() => {
    setMounted(true);
  }, []);

  const schema = useMemo(() => getContactSchema(dictionary), [dictionary]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      website: "",
      contact: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      country: "",
      zip: "",
      note: "",
      vatNumber: "",
    },
  });

  // Reset on every open so re-opening doesn't show stale values
  useEffect(() => {
    if (!open) return;
    if (contact) {
      form.reset({
        name: contact.name ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        website: contact.website ?? "",
        contact: contact.contact ?? "",
        addressLine1: contact.addressLine1 ?? "",
        addressLine2: contact.addressLine2 ?? "",
        city: contact.city ?? "",
        state: contact.state ?? "",
        country: contact.country ?? "",
        zip: contact.zip ?? "",
        note: contact.note ?? "",
        vatNumber: contact.vatNumber ?? "",
      });
      setBillingEmails(contact.billingEmails ? contact.billingEmails.split(",").map((e) => e.trim()) : []);
    } else {
      form.reset({
        name: "",
        email: "",
        phone: "",
        website: "",
        contact: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        country: "",
        zip: "",
        note: "",
        vatNumber: "",
      });
      setBillingEmails([]);
    }
    setBillingEmailsDirty(false);
  }, [open, contact, form]);

  const handleBillingEmailsChange = (next: string[]) => {
    setBillingEmails(next);
    setBillingEmailsDirty(true);
  };

  const handleClose = () => {
    form.reset();
    setBillingEmails([]);
    setBillingEmailsDirty(false);
    onClose();
  };

  if (!mounted || !canEdit) return null;

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const payload = {
        name: values.name,
        email: values.email,
        phone: values.phone || undefined,
        website: values.website || undefined,
        contact: values.contact || undefined,
        addressLine1: values.addressLine1 || undefined,
        addressLine2: values.addressLine2 || undefined,
        city: values.city || undefined,
        state: values.state || undefined,
        country: values.country || undefined,
        zip: values.zip || undefined,
        note: values.note || undefined,
        vatNumber: values.vatNumber || undefined,
        billingEmails,
      };

      const result = isEdit
        ? await updateContact(contact?.id || "", payload)
        : await createContact(payload);

      if (!result.success) {
        throw new Error(
          result.error ||
            (isEdit ? dictionary.contacts.toasts.update_failed : dictionary.contacts.toasts.create_failed),
        );
      }

      toast.success(isEdit ? dictionary.contacts.toasts.updated : dictionary.contacts.toasts.created);

      // Optimistic cache patch — supports infinite queries (pages[]) + regular queries (data[])
      if (result.data) {
        const updated = result.data as Contact;
        queryClient.setQueriesData<any>({ queryKey: ["contacts"], exact: false }, (old: any) => {
          if (!old) return old;
          if ("pages" in old && Array.isArray(old.pages)) {
            if (isEdit) {
              return {
                ...old,
                pages: old.pages.map((page: any) => ({
                  ...page,
                  data: (page.data ?? []).map((c: Contact) =>
                    c.id === updated.id ? { ...c, ...updated } : c,
                  ),
                })),
              };
            }
            const [firstPage, ...rest] = old.pages;
            if (!firstPage) return old;
            return {
              ...old,
              pages: [{ ...firstPage, data: [updated, ...(firstPage.data ?? [])] }, ...rest],
            };
          }
          if ("data" in old && Array.isArray(old.data)) {
            return isEdit
              ? { ...old, data: old.data.map((c: Contact) => (c.id === updated.id ? { ...c, ...updated } : c)) }
              : { ...old, data: [updated, ...old.data] };
          }
          return old;
        });
      }

      handleClose();

      // Background reconciliation
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : dictionary.common.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDisabled = isSubmitting || (!form.formState.isDirty && !billingEmailsDirty);

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="flex h-full flex-col p-0">
        <SheetHeader className="shrink-0 px-6 pt-6">
          <SheetTitle className="text-lg">
            {isEdit ? dictionary.contacts.details.edit_contact : dictionary.contacts.add_button}
          </SheetTitle>
        </SheetHeader>

        <div className="no-scrollbar flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
          <Form {...form}>
            <form id="contact-form" onSubmit={form.handleSubmit(onSubmit)}>
              <Accordion type="multiple" defaultValue={["general"]} className="space-y-4">
                <AccordionItem value="general" className="border-none">
                  <AccordionTrigger className="py-2 font-medium text-sm">
                    {dictionary.settings.sidebar.general}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-6 pt-2">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-normal text-muted-foreground text-xs">
                              {dictionary.contacts.form.name_label}
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder={dictionary.contacts.form.name_placeholder}
                                autoFocus
                                autoComplete="off"
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
                            <FormLabel className="font-normal text-muted-foreground text-xs">
                              {dictionary.contacts.form.email_label}
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="email"
                                autoComplete="off"
                                placeholder={dictionary.contacts.form.email_placeholder}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormItem>
                        <FormLabel className="font-normal text-muted-foreground text-xs">
                          {dictionary.contacts.form.billing_emails_label}
                        </FormLabel>
                        <BillingEmailsInput value={billingEmails} onChange={handleBillingEmailsChange} />
                        <p className="text-[10px] text-muted-foreground">
                          {dictionary.contacts.form.billing_emails_desc}
                        </p>
                      </FormItem>

                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-normal text-muted-foreground text-xs">
                              {dictionary.contacts.form.phone_label}
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="tel"
                                autoComplete="off"
                                placeholder={dictionary.contacts.form.phone_placeholder}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="website"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-normal text-muted-foreground text-xs">
                              {dictionary.contacts.form.website_label}
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                autoComplete="off"
                                placeholder={dictionary.contacts.form.website_placeholder}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="contact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-normal text-muted-foreground text-xs">
                              {dictionary.contacts.form.contact_person_label}
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                autoComplete="off"
                                placeholder={dictionary.contacts.form.contact_person_placeholder}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="details" className="border-none">
                  <AccordionTrigger className="py-2 font-medium text-sm">
                    {dictionary.transactions.details}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-6 pt-2">
                      <FormField
                        control={form.control}
                        name="addressLine1"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-normal text-muted-foreground text-xs">
                              {dictionary.contacts.form.address_label}
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                autoComplete="off"
                                placeholder={dictionary.contacts.form.address_placeholder}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="addressLine2"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-normal text-muted-foreground text-xs">
                              {dictionary.contacts.form.address_line_2_label}
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                autoComplete="off"
                                placeholder={dictionary.contacts.form.address_line_2_placeholder}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-normal text-muted-foreground text-xs">
                                {dictionary.contacts.form.city_label}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  autoComplete="off"
                                  placeholder={dictionary.contacts.form.city_placeholder}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="state"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-normal text-muted-foreground text-xs">
                                {dictionary.contacts.form.state_label}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  autoComplete="off"
                                  placeholder={dictionary.contacts.form.state_placeholder}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="country"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-normal text-muted-foreground text-xs">
                                {dictionary.contacts.form.country_label}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  autoComplete="off"
                                  placeholder={dictionary.contacts.form.country_placeholder}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="zip"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-normal text-muted-foreground text-xs">
                                {dictionary.contacts.form.zip_code_label}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  autoComplete="off"
                                  placeholder={dictionary.contacts.form.zip_code_placeholder}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="vatNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-normal text-muted-foreground text-xs">
                              {dictionary.contacts.form.tax_id_label}
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                autoComplete="off"
                                placeholder={dictionary.contacts.form.tax_id_placeholder}
                              />
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
                            <FormLabel className="font-normal text-muted-foreground text-xs">
                              {dictionary.contacts.form.notes_label}
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                className="min-h-[80px] resize-none"
                                placeholder={dictionary.contacts.form.notes_placeholder}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </form>
          </Form>
        </div>

        <div className="absolute right-0 bottom-0 left-0 bg-background p-6">
          <Button form="contact-form" type="submit" className="w-full" disabled={isDisabled}>
            {isSubmitting
              ? isEdit
                ? dictionary.contacts.form.saving
                : dictionary.contacts.form.creating
              : isEdit
                ? dictionary.contacts.form.save
                : dictionary.contacts.form.create}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
