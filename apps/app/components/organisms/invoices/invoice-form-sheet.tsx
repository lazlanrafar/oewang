"use client";

import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import Image from "next/image";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Dictionary } from "@workspace/dictionaries";
import type { CreateInvoiceData } from "@workspace/modules/client";
import { getTransactionSettings, updateTransactionSettings } from "@workspace/modules/client";
import { uploadVaultFile } from "@workspace/modules/vault/vault.action";
import type { Invoice } from "@workspace/types";
import { Button, cn, Form, FormControl, FormField, FormItem, FormMessage, Sheet, SheetContent } from "@workspace/ui";
import { format } from "date-fns";
import { Loader2, Plus, UploadCloud, X } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod/v3";

import { SelectContact } from "@/components/molecules/select-contact";

import { InvoiceSettings } from "./invoice-settings";

// --- Sub-Components for the "Hash" Empty States ---

// A hash gradient that mimics Midday's placeholder style.
const HASH_BG =
  "bg-[repeating-linear-gradient(-60deg,#DBDBDB,#DBDBDB_1px,transparent_1px,transparent_5px)] dark:bg-[repeating-linear-gradient(-60deg,#2C2C2C,#2C2C2C_1px,transparent_1px,transparent_5px)]";

interface HashInputProps extends InputHTMLAttributes<HTMLInputElement> {
  wrapperClassName?: string;
  hasValue?: boolean;
}

const HashInput = forwardRef<HTMLInputElement, HashInputProps>(
  ({ className, wrapperClassName, hasValue, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const showHash = !hasValue && !isFocused;

    return (
      <div className={cn("group relative transition-all", wrapperClassName)}>
        <input
          ref={ref}
          autoComplete="off"
          className={cn(
            "w-full border-0 border-transparent border-b bg-transparent p-1 text-sm outline-none transition-colors focus:border-border focus:ring-0",
            showHash ? "opacity-0" : "opacity-100",
            className,
          )}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        {showHash && (
          <div className="pointer-events-none absolute inset-0 p-1">
            <div className={cn("h-full w-full rounded-[2px]", HASH_BG)} />
          </div>
        )}
      </div>
    );
  },
);
HashInput.displayName = "HashInput";

interface HashTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  wrapperClassName?: string;
  hasValue?: boolean;
}

const HashTextarea = forwardRef<HTMLTextAreaElement, HashTextareaProps>(
  ({ className, wrapperClassName, hasValue, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const showHash = !hasValue && !isFocused;

    return (
      <div className={cn("group relative h-full transition-all", wrapperClassName)}>
        <textarea
          ref={ref}
          autoComplete="off"
          className={cn(
            "h-full w-full resize-none border-0 border-transparent border-b bg-transparent p-2 text-sm outline-none transition-colors focus:border-border focus:ring-0",
            showHash ? "opacity-0" : "opacity-100",
            className,
          )}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        {showHash && (
          <div className="pointer-events-none absolute inset-0 p-2">
            <div className={cn("h-full w-full rounded-[2px]", HASH_BG)} />
          </div>
        )}
      </div>
    );
  },
);
HashTextarea.displayName = "HashTextarea";

const HashImage = forwardRef<
  HTMLDivElement,
  {
    value?: string;
    onChange: (url: string) => void;
    className?: string;
  }
>(({ value, onChange, className }, ref) => {
  const [uploading, setUploading] = useState(false);
  const _fileInputRef = useState<HTMLInputElement | null>(null)[0];
  const internalRef = useRef<HTMLInputElement>(null);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await uploadVaultFile(formData);
      if (res.success) {
        onChange(res.data.url);
        // Also update default logo
        await updateTransactionSettings({
          invoiceLogoUrl: res.data.url,
        } as unknown);
      } else {
        toast.error("Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      ref={ref}
      className={cn(
        "group relative flex items-center justify-center overflow-hidden rounded-lg border border-dashed transition-all",
        !value && HASH_BG,
        className,
      )}
    >
      {value ? (
        <>
          <Image src={value} alt="Logo" fill unoptimized sizes="100vw" className="object-contain" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Button type="button" variant="secondary" size="sm" onClick={() => internalRef.current.click()}>
              Change
            </Button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => internalRef.current.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              internalRef.current.click();
            }
          }}
          className="flex h-full w-full cursor-pointer flex-col items-center justify-center transition-colors hover:bg-muted/50"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <>
              <UploadCloud className="mb-1 h-6 w-6 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Upload Logo</span>
            </>
          )}
        </button>
      )}
      <input
        ref={internalRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onUpload}
        disabled={uploading}
      />
    </div>
  );
});
HashImage.displayName = "HashImage";

// --- Schemas ---

const lineItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  quantity: z.number().min(0, "Must be >= 0"),
  price: z.number(),
});

const formSchema = z.object({
  contactId: z.string().min(1, "Please select a contact"),
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  currency: z.string().min(3).max(3),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  amount: z.number().min(0),
  vat: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  internalNote: z.string().optional(),
  noteDetails: z.string().optional(),
  paymentDetails: z.string().optional(),
  logoUrl: z.string().optional(),
  fromDetails: z.string().optional(),
  lineItems: z.array(lineItemSchema),
  status: z.enum(["draft", "unpaid", "paid", "overdue", "canceled"]).optional(),
  invoiceSize: z.string().default("A4"),
  dateFormat: z.string().default("DD/MM/YYYY"),
  paymentTerms: z.string().default("Due on Receipt"),
  templateName: z.string().default("Default"),
  invoiceSettings: z.object({
    salesTax: z.boolean().default(false),
    vat: z.boolean().default(false),
    lineItemTax: z.boolean().default(false),
    discount: z.boolean().default(false),
    decimals: z.boolean().default(false),
    units: z.boolean().default(false),
    qrCode: z.boolean().default(true),
  }),
  isPublic: z.boolean().default(false),
  accessCode: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface InvoiceFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: Invoice | null;
  onSuccess?: () => void;
  onSubmit: (data: CreateInvoiceData, isSilent?: boolean) => Promise<Invoice | boolean>;
  dictionary: Dictionary;
}

export function InvoiceFormSheet({
  open,
  onOpenChange,
  invoice,
  onSuccess,
  onSubmit,
  dictionary,
}: InvoiceFormSheetProps) {
  const dict = dictionary.invoices;
  const [loading, setLoading] = useState(false);
  const isEditing = !!invoice;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      contactId: "",
      invoiceNumber: "",
      currency: "USD",
      issueDate: format(new Date(), "yyyy-MM-dd"),
      dueDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"), // +30 days
      amount: 0,
      vat: 0,
      tax: 0,
      internalNote: "",
      noteDetails: "",
      paymentDetails: "",
      logoUrl: "",
      fromDetails: "",
      lineItems: [{ name: "", quantity: 1, price: 0 }],
      status: "draft" as const,
      invoiceSize: "A4",
      dateFormat: "DD/MM/YYYY",
      paymentTerms: "Due on Receipt",
      templateName: "Default",
      invoiceSettings: {
        salesTax: false,
        vat: false,
        lineItemTax: false,
        discount: false,
        decimals: false,
        units: false,
        qrCode: true,
      },
      isPublic: false,
      accessCode: "",
    },
  });

  const invoiceSettings = useWatch({
    control: form.control,
    name: "invoiceSettings",
  });

  const showVat = invoiceSettings.vat;
  const _showTax = invoiceSettings.salesTax;
  const showLineItemTax = invoiceSettings.lineItemTax;

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });

  // Watch values for inline math
  const watchedLineItems = useWatch({
    control: form.control,
    name: "lineItems",
  }) as FormValues["lineItems"];

  const vatRate = useWatch({ control: form.control, name: "vat" }) || 0;

  const discountRate = useWatch({ control: form.control, name: "discount" }) || 0;

  // Calculate Subtotal and Tax dynamically
  const subtotal = (watchedLineItems || []).reduce((acc: number, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    return acc + qty * price;
  }, 0);

  // Calculate Line Item Tax if enabled
  const lineItemTaxAmount = showLineItemTax
    ? (watchedLineItems || []).reduce((acc: number, item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const tax = Number((item as unknown).tax) || 0;
        return acc + qty * price * (tax / 100);
      }, 0)
    : 0;

  // Calculate Vat Amount
  const vatAmount = (subtotal * Number(vatRate)) / 100;
  const discountAmount = (subtotal * Number(discountRate)) / 100;
  const totalAmount = subtotal + vatAmount + lineItemTaxAmount - discountAmount;

  // Auto-sync calculated amount to form state before submission
  useEffect(() => {
    form.setValue("amount", totalAmount, { shouldValidate: false });
  }, [totalAmount, form]);

  // Fetch workspace settings to set default logo
  useEffect(() => {
    if (open && !isEditing) {
      getTransactionSettings().then((res) => {
        if (res.success && res.data.invoiceLogoUrl) {
          form.setValue("logoUrl", res.data.invoiceLogoUrl);
        }
      });
    }
  }, [open, isEditing, form]);

  useEffect(() => {
    if (invoice && open) {
      form.reset({
        contactId: invoice.contactId ?? "",
        invoiceNumber: invoice.invoiceNumber ?? "",
        currency: invoice.currency ?? "USD",
        issueDate: invoice.issueDate.slice(0, 10) ?? "",
        dueDate: invoice.dueDate.slice(0, 10) ?? "",
        amount: Number(invoice.amount ?? 0),
        vat: Number(invoice.vat ?? 0),
        tax: Number(invoice.tax ?? 0),
        internalNote: invoice.internalNote ?? "",
        noteDetails: invoice.noteDetails ?? "",
        paymentDetails: (invoice as unknown).paymentDetails ?? "",
        logoUrl: (invoice as unknown).logoUrl ?? "",
        fromDetails: (invoice as unknown).fromDetails ?? "", // Assuming we might add this later
        lineItems: (invoice.lineItems as unknown[]) ?? [{ name: "", quantity: 1, price: 0 }],
        status: invoice.status || "draft",
        invoiceSize: (invoice as unknown).invoiceSize || "A4",
        dateFormat: (invoice as unknown).dateFormat || "DD/MM/YYYY",
        paymentTerms: (invoice as unknown).paymentTerms || "Due on Receipt",
        templateName: (invoice as unknown).templateName || "Default",
        invoiceSettings: (invoice as unknown).invoiceSettings || {
          salesTax: false,
          vat: false,
          lineItemTax: false,
          discount: false,
          decimals: false,
          units: false,
          qrCode: true,
        },
        isPublic: invoice.isPublic ?? false,
        accessCode: (invoice as unknown).accessCode ?? "",
      });
    } else if (open && !invoice) {
      const today = new Date();
      const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      form.reset({
        contactId: "",
        invoiceNumber: `INV-${Math.floor(Math.random() * 10000)
          .toString()
          .padStart(4, "0")}`,
        currency: "USD",
        issueDate: format(today, "yyyy-MM-dd"),
        dueDate: format(nextMonth, "yyyy-MM-dd"),
        amount: 0,
        vat: 0,
        tax: 0,
        internalNote: "",
        noteDetails: "",
        paymentDetails: "",
        logoUrl: "",
        fromDetails: "",
        lineItems: [{ name: "", quantity: 1, price: 0 }],
        status: "draft" as const,
        invoiceSize: "A4",
        dateFormat: "DD/MM/YYYY",
        paymentTerms: "Due on Receipt",
        templateName: "Default",
        invoiceSettings: {
          salesTax: false,
          vat: false,
          lineItemTax: false,
          discount: false,
          decimals: false,
          units: false,
          qrCode: true,
        },
        isPublic: false,
        accessCode: "",
      });
    }
  }, [invoice, open, form]);

  const onFormSubmit = useCallback(
    async (values: FormValues, isSilent = false) => {
      if (loading) return;
      setLoading(true);
      try {
        // Re-calculate one last time before submit to be safe
        const st = values.lineItems.reduce((acc, item) => acc + Number(item.quantity) * Number(item.price), 0);
        const va = (st * Number(values.vat || 0)) / 100;
        const finalAmt = st + va;

        const payload = { ...values, amount: finalAmt };

        const result = await onSubmit(payload as CreateInvoiceData, isSilent);
        if (result) {
          if (!isSilent) {
            toast.success(isEditing ? "Invoice updated" : "Invoice created");
            onSuccess?.();
            onOpenChange(false);
          }
        }
      } catch {
        if (!isSilent) toast.error("Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [isEditing, loading, onOpenChange, onSubmit, onSuccess],
  );

  // Auto-save as draft when contact is selected for a new invoice
  const contactId = useWatch({ control: form.control, name: "contactId" });
  useEffect(() => {
    if (open && !isEditing && contactId && form.getValues("status") === "draft") {
      const currentValues = form.getValues();
      if (currentValues.invoiceNumber) {
        onFormSubmit(currentValues, true);
      }
    }
  }, [contactId, open, isEditing, form, onFormSubmit]);

  const handleSubmit = (values: FormValues) => onFormSubmit(values, false);

  const selectedCurrency = form.watch("currency") || "USD";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* 
        Remove the default padding, handle scrolling internally.
        We make the background gray/black, and put an A4 sheet inside.
      */}
      <SheetContent className="flex w-[90vw] flex-col p-0 sm:max-w-[630px]">
        {/* A4 Document Scrolling Area */}
        <div className="flex flex-1 justify-center overflow-y-auto p-4 pb-24 md:p-8">
          <Form {...form}>
            <form
              id="invoice-form"
              onSubmit={form.handleSubmit(handleSubmit)}
              className="relative flex h-max min-h-[900px] w-full max-w-3xl flex-col border bg-[#fcfcfc] p-6 pb-16 shadow-sm md:p-8 dark:bg-[#0f0f0f]"
            >
              {/* HEADER ROW */}
              <div className="mb-12 flex items-start justify-between">
                {/* Meta block */}
                <div className="flex w-[240px] flex-col gap-1">
                  <h1 className="mb-4 font-serif text-3xl tracking-tight">{dict.details.title || "Invoice"}</h1>

                  <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{dict.details.number || "Invoice No"}:</span>
                    <FormField
                      control={form.control as unknown}
                      name="invoiceNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <HashInput
                              hasValue={!!field.value}
                              placeholder="INV-001"
                              {...field}
                              className="font-medium"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{dict.details.issued || "Issue Date"}:</span>
                    <FormField
                      control={form.control as unknown}
                      name="issueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <HashInput
                              type="date"
                              hasValue={!!field.value}
                              {...field}
                              className="text-muted-foreground text-xs"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{dict.details.due || "Due Date"}:</span>
                    <FormField
                      control={form.control as unknown}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <HashInput
                              type="date"
                              hasValue={!!field.value}
                              {...field}
                              className="text-muted-foreground text-xs"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Logo Section */}
                <div className="flex flex-col items-end">
                  <FormField
                    control={form.control as unknown}
                    name="logoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <HashImage value={field.value} onChange={field.onChange} className="h-24 w-24" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* ADDRESSES ROW */}
              <div className="mb-8 grid grid-cols-2 gap-8">
                {/* From Details */}
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] text-muted-foreground">{dict.details.from || "From"}</span>
                  <FormField
                    control={form.control as unknown}
                    name="fromDetails"
                    render={({ field }) => (
                      <FormItem className="h-28">
                        <FormControl>
                          <HashTextarea
                            hasValue={!!field.value}
                            placeholder={dict.placeholders.from_details || "Your Company Details..."}
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* To Details (Customer) */}
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] text-muted-foreground">{dict.details.bill_to || "To"}</span>
                  <FormField
                    control={form.control as unknown}
                    name="contactId"
                    render={({ field }) => (
                      <FormItem>
                        <SelectContact
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={dict.placeholders.select_contact || "Select contact"}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* LINE ITEMS TABLE */}
              <div className="mb-12 flex flex-1 flex-col">
                {/* Header */}
                <div
                  className={cn(
                    "mb-2 grid items-end gap-2 border-b pb-2",
                    showLineItemTax
                      ? "grid-cols-[1.5fr_80px_100px_80px_100px_30px]"
                      : "grid-cols-[1.5fr_100px_100px_100px_30px]",
                  )}
                >
                  <span className="text-[11px] text-muted-foreground">{dict.columns.description || "Description"}</span>
                  <span className="pr-2 text-right text-[11px] text-muted-foreground">
                    {dict.columns.qty || "Quantity"}
                  </span>
                  <span className="pr-2 text-right text-[11px] text-muted-foreground">
                    {dict.columns.rate || "Price"}
                  </span>
                  {showLineItemTax && (
                    <span className="pr-2 text-right text-[11px] text-muted-foreground">
                      {dict.columns.tax || "Tax"} (%)
                    </span>
                  )}
                  <span className="text-right text-[11px] text-muted-foreground">{dict.columns.amount || "Total"}</span>
                  <span />
                </div>

                {/* Rows */}
                <div className="flex flex-col gap-2">
                  {fields.map((field, index) => {
                    const qty = watchedLineItems[index].quantity || 0;
                    const prc = watchedLineItems[index].price || 0;
                    const rowTotal = Number(qty) * Number(prc);

                    return (
                      <div
                        key={field.id}
                        className={cn(
                          "group grid items-start gap-2",
                          showLineItemTax
                            ? "grid-cols-[1.5fr_80px_100px_80px_100px_30px]"
                            : "grid-cols-[1.5fr_100px_100px_100px_30px]",
                        )}
                      >
                        <FormField
                          control={form.control as unknown}
                          name={`lineItems.${index}.name`}
                          render={({ field }) => (
                            <FormItem className="space-y-0">
                              <FormControl>
                                <HashInput hasValue={!!field.value} placeholder="Item description" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control as unknown}
                          name={`lineItems.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem className="space-y-0">
                              <FormControl>
                                <HashInput
                                  type="number"
                                  hasValue={!!field.value}
                                  className="pr-2 text-right tabular-nums"
                                  {...field}
                                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <div className="flex items-center">
                          <FormField
                            control={form.control as unknown}
                            name={`lineItems.${index}.price`}
                            render={({ field }) => (
                              <FormItem className="w-full space-y-0">
                                <FormControl>
                                  <HashInput
                                    type="number"
                                    step="0.01"
                                    hasValue={!!field.value || field.value === 0}
                                    className="pr-2 text-right tabular-nums"
                                    {...field}
                                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>

                        {showLineItemTax && (
                          <div className="flex items-center">
                            <FormField
                              control={form.control as unknown}
                              name={`lineItems.${index}.tax`}
                              render={({ field }) => (
                                <FormItem className="w-full space-y-0">
                                  <FormControl>
                                    <HashInput
                                      type="number"
                                      step="0.1"
                                      hasValue={!!field.value || field.value === 0}
                                      className="pr-2 text-right tabular-nums"
                                      {...field}
                                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-end py-1 text-right font-mono text-xs tracking-tight">
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: selectedCurrency,
                          }).format(rowTotal)}
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 self-center text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                          onClick={() => remove(index)}
                          disabled={fields.length <= 1}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {/* ADD ITEM BUTTON */}
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => append({ description: "", quantity: 1, rate: 0, tax: 0 })}
                    className="h-8 gap-1.5 font-medium text-[11px] text-primary transition-colors hover:bg-primary/5 hover:text-primary"
                  >
                    <Plus className="h-3 w-3" />
                    {dict.actions.add_item || "Add Item"}
                  </Button>
                </div>
              </div>

              {/* FOOTER SUMMARY & NOTES */}
              <div className="gap-12">
                {/* Arithmetic Block */}
                <div className="flex justify-end">
                  <div className="flex w-[300px] flex-col pt-2">
                    <div className="flex items-center justify-between border-transparent border-b py-1.5">
                      <span className="text-[11px] text-muted-foreground">{dict.details.subtotal || "Subtotal"}</span>
                      <span className="font-mono text-muted-foreground text-xs tabular-nums">
                        {new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: selectedCurrency,
                        }).format(subtotal)}
                      </span>
                    </div>

                    {showVat && (
                      <div className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">{dict.details.vat || "VAT"} (%)</span>
                          <FormField
                            control={form.control}
                            name="vat"
                            render={({ field }) => (
                              <FormItem className="w-12 space-y-0">
                                <FormControl>
                                  <HashInput
                                    type="number"
                                    step="0.1"
                                    hasValue={field.value !== undefined}
                                    className="text-[11px] tabular-nums"
                                    {...field}
                                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        <span className="font-mono text-muted-foreground text-xs tabular-nums">
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: selectedCurrency,
                          }).format(vatAmount)}
                        </span>
                      </div>
                    )}

                    {showLineItemTax && (
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-[11px] text-muted-foreground">
                          {dict.settings.line_item_tax || "Line item tax"}
                        </span>
                        <span className="font-mono text-muted-foreground text-xs tabular-nums">
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: selectedCurrency,
                          }).format(lineItemTaxAmount)}
                        </span>
                      </div>
                    )}

                    {invoiceSettings.discount && (
                      <div className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            {dict.details.discount || "Discount"} (%)
                          </span>
                          <FormField
                            control={form.control}
                            name="discount"
                            render={({ field }) => (
                              <FormItem className="w-12 space-y-0">
                                <FormControl>
                                  <HashInput
                                    type="number"
                                    step="0.1"
                                    hasValue={field.value !== undefined}
                                    className="text-[11px] tabular-nums"
                                    {...field}
                                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        <span className="font-mono text-muted-foreground text-red-500 text-xs tabular-nums">
                          -
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: selectedCurrency,
                          }).format(discountAmount)}
                        </span>
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-between border-t py-4">
                      <span className="font-medium text-[13px]">{dict.details.total || "Total"}</span>
                      <span className="font-medium font-serif text-xl tracking-tight">
                        {new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: selectedCurrency,
                        }).format(totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes & Payment Block */}
                <div className="mt-10 flex flex-1 flex-col gap-6">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {dict.details.payment_details || "Payment Details"}
                      </span>
                      <FormField
                        control={form.control}
                        name="paymentDetails"
                        render={({ field }) => (
                          <FormItem className="h-28 space-y-0">
                            <FormControl>
                              <HashTextarea
                                hasValue={!!field.value}
                                placeholder={dict.placeholders.payment_details || "Bank account, PayPal, etc..."}
                                {...field}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] text-muted-foreground">{dict.details.note || "Note"}</span>
                      <FormField
                        control={form.control}
                        name="noteDetails"
                        render={({ field }) => (
                          <FormItem className="h-28 space-y-0">
                            <FormControl>
                              <HashTextarea
                                hasValue={!!field.value}
                                placeholder={dict.placeholders.note || "Thank you for your business!"}
                                {...field}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </Form>
        </div>

        {/* FIXED BOTTOM ACTIONS (Out of the scroll area) */}
        <div className="flex shrink-0 items-center justify-between border-border border-t bg-background px-10 py-4">
          <div className="flex items-center gap-2">
            <InvoiceSettings
              settings={form.watch()}
              onUpdate={(key, value) => form.setValue(key as unknown, value, { shouldDirty: true })}
              onRename={() => {
                const newName = prompt(
                  dict.actions.rename_template || "Enter template name:",
                  form.getValues("templateName"),
                );
                if (newName) form.setValue("templateName", newName);
              }}
              dictionary={dictionary}
            />
            <div className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-3 py-1.5">
              <span className="font-medium text-xs">{dict.details.template_label || "Template"}:</span>
              <span className="text-muted-foreground text-xs">{form.watch("templateName")}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {dictionary.common.cancel || "Cancel"}
            </Button>
            <Button type="submit" form="invoice-form" disabled={loading}>
              {loading
                ? dictionary.common.saving || "Saving..."
                : isEditing
                  ? dictionary.common.save || "Save"
                  : dictionary.common.create || "Create"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
