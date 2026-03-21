"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
} from "@workspace/ui";
import { createContact, updateContact } from "@workspace/modules/client";
import { useQueryClient } from "@tanstack/react-query";
import type { Contact } from "@workspace/types";
import { X } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email"),
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

type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  contact?: Contact | null;
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
      .filter(
        (e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !value.includes(e),
      );
    if (emails.length) {
      onChange([...value, ...emails]);
    }
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
    <div
      className="min-h-9 w-full border border-input bg-transparent px-3 py-1.5 text-sm flex flex-wrap gap-1.5 cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((email) => (
        <Badge
          key={email}
          variant="secondary"
          className="flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs font-normal"
        >
          {email}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeEmail(email);
            }}
            className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? "email@example.com" : ""}
        className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground/60 text-sm"
      />
    </div>
  );
}

export function ContactFormSheet({ open, onClose, contact }: Props) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [billingEmails, setBillingEmails] = useState<string[]>(
    (contact as any)?.billingEmails ?? [],
  );
  const isEdit = !!contact;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema as any),
    defaultValues: {
      name: contact?.name ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      website: contact?.website ?? "",
      contact: (contact as any)?.contact ?? "",
      addressLine1: contact?.addressLine1 ?? "",
      addressLine2: contact?.addressLine2 ?? "",
      city: contact?.city ?? "",
      state: contact?.state ?? "",
      country: contact?.country ?? "",
      zip: contact?.zip ?? "",
      note: contact?.note ?? "",
      vatNumber: contact?.vatNumber ?? "",
    },
  });

  useEffect(() => {
    if (contact) {
      form.reset({
        name: contact.name ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        website: contact.website ?? "",
        contact: (contact as any).contact ?? "",
        addressLine1: contact.addressLine1 ?? "",
        addressLine2: contact.addressLine2 ?? "",
        city: contact.city ?? "",
        state: contact.state ?? "",
        country: contact.country ?? "",
        zip: contact.zip ?? "",
        note: contact.note ?? "",
        vatNumber: contact.vatNumber ?? "",
      });
      setBillingEmails((contact as any).billingEmails ?? []);
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
  }, [contact, form]);

  const handleClose = () => {
    form.reset();
    setBillingEmails([]);
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const payload = {
        name: values.name,
        email: values.email,
        phone: values.phone || null,
        website: values.website || null,
        contact: values.contact || null,
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
        ? await updateContact(contact!.id, payload)
        : await createContact(payload as any);

      if (result.success) {
        toast.success(isEdit ? "Contact updated" : "Contact created");
        queryClient.invalidateQueries({ queryKey: ["contacts"] });
        handleClose();
      } else {
        toast.error(result.error || "Something went wrong");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="sm:max-w-[520px] p-0 flex flex-col">
        <SheetHeader className="p-6 pb-0 shrink-0">
          <SheetTitle>{isEdit ? "Edit Contact" : "New Contact"}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col flex-1 min-h-0"
          >
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-6">
              <Accordion
                type="multiple"
                defaultValue={["general"]}
                className="space-y-4"
              >
                {/* General */}
                <AccordionItem value="general" className="border-none">
                  <AccordionTrigger className="text-sm font-medium py-2">
                    General
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Name
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Acme Inc"
                                autoFocus
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
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Email
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="email"
                                placeholder="acme@example.com"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Billing Emails */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground font-normal">
                          Billing Emails (BCC)
                        </label>
                        <BillingEmailsInput
                          value={billingEmails}
                          onChange={setBillingEmails}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Additional emails to BCC when sending invoices. Press
                          Enter or comma to add.
                        </p>
                      </div>

                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Phone
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="tel"
                                placeholder="+1 (555) 123-4567"
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
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Website
                            </FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="acme.com" />
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
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Contact Person
                            </FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="John Doe" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Details */}
                <AccordionItem value="details" className="border-none">
                  <AccordionTrigger className="text-sm font-medium py-2">
                    Details
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <FormField
                        control={form.control}
                        name="addressLine1"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Address Line 1
                            </FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="123 Main St" />
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
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Address Line 2
                            </FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Suite 100" />
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
                              <FormLabel className="text-xs text-muted-foreground font-normal">
                                City
                              </FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="New York" />
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
                              <FormLabel className="text-xs text-muted-foreground font-normal">
                                State
                              </FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="NY" />
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
                              <FormLabel className="text-xs text-muted-foreground font-normal">
                                Country
                              </FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="United States" />
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
                              <FormLabel className="text-xs text-muted-foreground font-normal">
                                ZIP Code
                              </FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="10001" />
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
                            <FormLabel className="text-xs text-muted-foreground font-normal">
                              Tax ID / VAT Number
                            </FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="US123456789" />
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
                                className="min-h-[80px] resize-none"
                                placeholder="Additional information..."
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
            </div>

            {/* Fixed bottom actions */}
            <div className="border-t px-6 py-4 flex justify-end gap-3 shrink-0">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : isEdit ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
