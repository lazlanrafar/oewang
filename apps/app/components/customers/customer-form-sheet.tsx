"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v3";
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
} from "@workspace/ui";
import { createCustomer, updateCustomer } from "@workspace/modules/client";
import { useQueryClient } from "@tanstack/react-query";
import type { Customer } from "@workspace/types";

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
  customer?: Customer | null;
}

export function CustomerFormSheet({ open, onClose, customer }: Props) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEdit = !!customer;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      website: customer?.website ?? "",
      contact: customer?.contact ?? "",
      addressLine1: customer?.addressLine1 ?? "",
      addressLine2: customer?.addressLine2 ?? "",
      city: customer?.city ?? "",
      state: customer?.state ?? "",
      country: customer?.country ?? "",
      zip: customer?.zip ?? "",
      note: customer?.note ?? "",
      vatNumber: customer?.vatNumber ?? "",
    },
  });

  const handleClose = () => {
    form.reset();
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
        addressLine1: values.addressLine1 || null,
        addressLine2: values.addressLine2 || null,
        city: values.city || null,
        state: values.state || null,
        country: values.country || null,
        zip: values.zip || null,
        note: values.note || null,
        vatNumber: values.vatNumber || null,
      };

      const result = isEdit
        ? await updateCustomer(customer!.id, payload)
        : await createCustomer(payload);

      if (result.success) {
        toast.success(isEdit ? "Customer updated" : "Customer created");
        queryClient.invalidateQueries({ queryKey: ["customers"] });
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
      <SheetContent className="sm:max-w-[520px] overflow-y-auto p-0">
        <SheetHeader className="p-6 pb-0">
          <SheetTitle>{isEdit ? "Edit Customer" : "New Customer"}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col h-full"
          >
            <div className="flex-1 overflow-y-auto p-6">
              <Accordion
                type="multiple"
                defaultValue={["general"]}
                className="space-y-4"
              >
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

            <div className="border-t px-6 py-4 flex justify-end gap-3">
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
