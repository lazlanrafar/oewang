"use client";

import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v3";
import {
  useState,
  useEffect,
  forwardRef,
  useRef,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@workspace/ui";
import {
  Plus,
  Trash2,
  X,
  Settings,
  FileText,
  Landmark,
  UploadCloud,
  Loader2,
} from "lucide-react";
import type { Invoice } from "@workspace/types";
import type { CreateInvoiceData } from "@workspace/modules/client";
import { cn } from "@workspace/ui";
import { format } from "date-fns";
import { SelectContact } from "@/components/molecules/select-contact";
import { InvoiceSettings } from "./invoice-settings";
import { uploadVaultFile } from "@workspace/modules/vault/vault.action";
import {
  getTransactionSettings,
  updateTransactionSettings,
} from "@workspace/modules/client";

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
      <div className={cn("relative group transition-all", wrapperClassName)}>
        <input
          ref={ref}
          autoComplete="off"
          className={cn(
            "w-full bg-transparent border-0 p-1 text-sm border-b border-transparent focus:border-border outline-none transition-colors focus:ring-0",
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
          <div className="absolute inset-0 pointer-events-none p-1">
            <div className={cn("w-full h-full rounded-[2px]", HASH_BG)} />
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
      <div
        className={cn("relative group transition-all h-full", wrapperClassName)}
      >
        <textarea
          ref={ref}
          autoComplete="off"
          className={cn(
            "w-full h-full bg-transparent border-0 p-2 text-sm border-b border-transparent focus:border-border outline-none resize-none transition-colors focus:ring-0",
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
          <div className="absolute inset-0 pointer-events-none p-2">
            <div className={cn("w-full h-full rounded-[2px]", HASH_BG)} />
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
  const fileInputRef = useState<HTMLInputElement | null>(null)[0];
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
        } as any);
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
        "relative rounded-lg border border-dashed flex items-center justify-center overflow-hidden group transition-all",
        !value && HASH_BG,
        className,
      )}
    >
      {value ? (
        <>
          <img
            src={value}
            alt="Logo"
            className="w-full h-full object-contain"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => internalRef.current?.click()}
            >
              Change
            </Button>
          </div>
        </>
      ) : (
        <div 
          onClick={() => internalRef.current?.click()}
          className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <>
              <UploadCloud className="h-6 w-6 text-muted-foreground mb-1" />
              <span className="text-[10px] text-muted-foreground">
                Upload Logo
              </span>
            </>
          )}
        </div>
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
  onSubmit: (
    data: CreateInvoiceData,
    isSilent?: boolean,
  ) => Promise<Invoice | boolean>;
}

export function InvoiceFormSheet({
  open,
  onOpenChange,
  invoice,
  onSuccess,
  onSubmit,
}: InvoiceFormSheetProps) {
  const [loading, setLoading] = useState(false);
  const isEditing = !!invoice;

  const form = useForm<any>({
    resolver: zodResolver(formSchema as any),
    defaultValues: {
      contactId: "",
      invoiceNumber: "",
      currency: "USD",
      issueDate: format(new Date(), "yyyy-MM-dd"),
      dueDate: format(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        "yyyy-MM-dd",
      ), // +30 days
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

  const showVat = invoiceSettings?.vat;
  const showTax = invoiceSettings?.salesTax;
  const showLineItemTax = invoiceSettings?.lineItemTax;

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });

  // Watch values for inline math
  const watchedLineItems =
    useWatch({
      control: form.control,
      name: "lineItems",
    }) || [];

  const vatRate = useWatch({ control: form.control, name: "vat" }) || 0;

  const discountRate =
    useWatch({ control: form.control, name: "discount" }) || 0;

  // Calculate Subtotal and Tax dynamically
  const subtotal = watchedLineItems.reduce((acc: number, item: any) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    return acc + qty * price;
  }, 0);

  // Calculate Line Item Tax if enabled
  const lineItemTaxAmount = showLineItemTax
    ? watchedLineItems.reduce((acc: number, item: any) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const tax = Number(item.tax) || 0;
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
        issueDate: invoice.issueDate?.slice(0, 10) ?? "",
        dueDate: invoice.dueDate?.slice(0, 10) ?? "",
        amount: Number(invoice.amount ?? 0),
        vat: Number(invoice.vat ?? 0),
        tax: Number(invoice.tax ?? 0),
        internalNote: invoice.internalNote ?? "",
        noteDetails: invoice.noteDetails ?? "",
        paymentDetails: (invoice as any).paymentDetails ?? "",
        logoUrl: (invoice as any).logoUrl ?? "",
        fromDetails: (invoice as any).fromDetails ?? "", // Assuming we might add this later
        lineItems: (invoice.lineItems as any[]) ?? [
          { name: "", quantity: 1, price: 0 },
        ],
        status: invoice.status || "draft",
        invoiceSize: (invoice as any).invoiceSize || "A4",
        dateFormat: (invoice as any).dateFormat || "DD/MM/YYYY",
        paymentTerms: (invoice as any).paymentTerms || "Due on Receipt",
        templateName: (invoice as any).templateName || "Default",
        invoiceSettings: (invoice as any).invoiceSettings || {
          salesTax: false,
          vat: false,
          lineItemTax: false,
          discount: false,
          decimals: false,
          units: false,
          qrCode: true,
        },
        isPublic: invoice.isPublic ?? false,
        accessCode: (invoice as any).accessCode ?? "",
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

  // Auto-save as draft when contact is selected for a new invoice
  const contactId = useWatch({ control: form.control, name: "contactId" });
  useEffect(() => {
    if (
      open &&
      !isEditing &&
      contactId &&
      form.getValues("status") === "draft"
    ) {
      const currentValues = form.getValues();
      if (currentValues.invoiceNumber) {
        onFormSubmit(currentValues, true);
      }
    }
  }, [contactId, open, isEditing, form, onSubmit]);

  const onFormSubmit = async (values: FormValues, isSilent = false) => {
    if (loading) return;
    setLoading(true);
    try {
      // Re-calculate one last time before submit to be safe
      const st = values.lineItems.reduce(
        (acc, item) => acc + Number(item.quantity) * Number(item.price),
        0,
      );
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
  };

  const handleSubmit = (values: FormValues) => onFormSubmit(values, false);

  const selectedCurrency = form.watch("currency") || "USD";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* 
        Remove the default padding, handle scrolling internally.
        We make the background gray/black, and put an A4 sheet inside.
      */}
      <SheetContent className="sm:max-w-[630px] w-[90vw] p-0 flex flex-col">
        {/* A4 Document Scrolling Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center pb-24">
          <Form {...(form as any)}>
            <form
              id="invoice-form"
              onSubmit={form.handleSubmit(handleSubmit)}
              className="w-full max-w-3xl bg-[#fcfcfc] dark:bg-[#0f0f0f] shadow-sm border p-6 md:p-8 pb-16 flex flex-col relative h-max min-h-[900px]"
            >
              {/* HEADER ROW */}
              <div className="flex justify-between items-start mb-12">
                {/* Meta block */}
                <div className="flex flex-col gap-1 w-[240px]">
                  <h1 className="text-3xl font-serif tracking-tight mb-4">
                    Invoice
                  </h1>

                  <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      Invoice No:
                    </span>
                    <FormField
                      control={form.control as any}
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
                    <span className="text-[11px] text-muted-foreground">
                      Issue Date:
                    </span>
                    <FormField
                      control={form.control as any}
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
                    <span className="text-[11px] text-muted-foreground">
                      Due Date:
                    </span>
                    <FormField
                      control={form.control as any}
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
                    control={form.control as any}
                    name="logoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <HashImage
                            value={field.value}
                            onChange={field.onChange}
                            className="w-24 h-24"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* ADDRESSES ROW */}
              <div className="grid grid-cols-2 gap-8 mb-8">
                {/* From Details */}
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    From
                  </span>
                  <FormField
                    control={form.control as any}
                    name="fromDetails"
                    render={({ field }) => (
                      <FormItem className="h-28">
                        <FormControl>
                          <HashTextarea
                            hasValue={!!field.value}
                            placeholder="Your Company Details..."
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* To Details (Customer) */}
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] text-muted-foreground">To</span>
                  <FormField
                    control={form.control as any}
                    name="contactId"
                    render={({ field }) => (
                      <FormItem>
                        <SelectContact
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Select contact"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* LINE ITEMS TABLE */}
              <div className="flex flex-col mb-12 flex-1">
                {/* Header */}
                <div
                  className={cn(
                    "grid gap-2 items-end mb-2 pb-2 border-b",
                    showLineItemTax
                      ? "grid-cols-[1.5fr_80px_100px_80px_100px_30px]"
                      : "grid-cols-[1.5fr_100px_100px_100px_30px]",
                  )}
                >
                  <span className="text-[11px] text-muted-foreground">
                    Description
                  </span>
                  <span className="text-[11px] text-muted-foreground text-right pr-2">
                    Quantity
                  </span>
                  <span className="text-[11px] text-muted-foreground text-right pr-2">
                    Price
                  </span>
                  {showLineItemTax && (
                    <span className="text-[11px] text-muted-foreground text-right pr-2">
                      Tax (%)
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground text-right">
                    Total
                  </span>
                  <span></span>
                </div>

                {/* Rows */}
                <div className="flex flex-col gap-2">
                  {fields.map((field, index) => {
                    const qty = watchedLineItems[index]?.quantity || 0;
                    const prc = watchedLineItems[index]?.price || 0;
                    const rowTotal = Number(qty) * Number(prc);

                    return (
                      <div
                        key={field.id}
                        className={cn(
                          "grid gap-2 items-start group",
                          showLineItemTax
                            ? "grid-cols-[1.5fr_80px_100px_80px_100px_30px]"
                            : "grid-cols-[1.5fr_100px_100px_100px_30px]",
                        )}
                      >
                        <FormField
                          control={form.control as any}
                          name={`lineItems.${index}.name`}
                          render={({ field }) => (
                            <FormItem className="space-y-0">
                              <FormControl>
                                <HashInput
                                  hasValue={!!field.value}
                                  placeholder="Item description"
                                  {...field}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control as any}
                          name={`lineItems.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem className="space-y-0">
                              <FormControl>
                                <HashInput
                                  type="number"
                                  hasValue={!!field.value}
                                  className="text-right tabular-nums pr-2"
                                  {...field}
                                  onChange={(e) =>
                                    field.onChange(
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <div className="flex items-center">
                          <FormField
                            control={form.control as any}
                            name={`lineItems.${index}.price`}
                            render={({ field }) => (
                              <FormItem className="space-y-0 w-full">
                                <FormControl>
                                  <HashInput
                                    type="number"
                                    step="0.01"
                                    hasValue={
                                      !!field.value || field.value === 0
                                    }
                                    className="text-right tabular-nums pr-2"
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(
                                        parseFloat(e.target.value) || 0,
                                      )
                                    }
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>

                        {showLineItemTax && (
                          <div className="flex items-center">
                            <FormField
                              control={form.control as any}
                              name={`lineItems.${index}.tax`}
                              render={({ field }) => (
                                <FormItem className="space-y-0 w-full">
                                  <FormControl>
                                    <HashInput
                                      type="number"
                                      step="0.1"
                                      hasValue={
                                        !!field.value || field.value === 0
                                      }
                                      className="text-right tabular-nums pr-2"
                                      {...field}
                                      onChange={(e) =>
                                        field.onChange(
                                          parseFloat(e.target.value) || 0,
                                        )
                                      }
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        )}

                        <div className="text-right text-xs py-1 font-mono tracking-tight flex items-center justify-end">
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: selectedCurrency,
                          }).format(rowTotal)}
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity self-center text-muted-foreground hover:text-destructive"
                          onClick={() => remove(index)}
                          disabled={fields.length <= 1}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-[11px] text-muted-foreground hover:text-foreground h-7 px-2 -ml-2 transition-colors"
                    onClick={() => append({ name: "", quantity: 1, price: 0 })}
                  >
                    <Plus className="h-3 w-3" /> Add item
                  </Button>
                </div>
              </div>

              {/* FOOTER SUMMARY & NOTES */}
              <div className="gap-12">
                {/* Arithmetic Block */}
                <div className="flex justify-end">
                  <div className="w-[300px] flex flex-col pt-2">
                    <div className="flex justify-between items-center py-1.5 border-b border-transparent">
                      <span className="text-[11px] text-muted-foreground">
                        Subtotal
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums font-mono">
                        {new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: selectedCurrency,
                        }).format(subtotal)}
                      </span>
                    </div>
                    {showVat && (
                      <div className="flex justify-between items-center py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            VAT (%)
                          </span>
                          <FormField
                            control={form.control}
                            name="vat"
                            render={({ field }) => (
                              <FormItem className="space-y-0 w-12">
                                <FormControl>
                                  <HashInput
                                    type="number"
                                    step="0.1"
                                    hasValue={field.value !== undefined}
                                    className="text-[11px] tabular-nums"
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(
                                        parseFloat(e.target.value) || 0,
                                      )
                                    }
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums font-mono">
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: selectedCurrency,
                          }).format(vatAmount)}
                        </span>
                      </div>
                    )}

                    {showLineItemTax && (
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-[11px] text-muted-foreground">
                          Line item tax
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums font-mono">
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: selectedCurrency,
                          }).format(lineItemTaxAmount)}
                        </span>
                      </div>
                    )}

                    {invoiceSettings?.discount && (
                      <div className="flex justify-between items-center py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            Discount (%)
                          </span>
                          <FormField
                            control={form.control}
                            name="discount"
                            render={({ field }) => (
                              <FormItem className="space-y-0 w-12">
                                <FormControl>
                                  <HashInput
                                    type="number"
                                    step="0.1"
                                    hasValue={field.value !== undefined}
                                    className="text-[11px] tabular-nums"
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(
                                        parseFloat(e.target.value) || 0,
                                      )
                                    }
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums font-mono text-red-500">
                          -
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: selectedCurrency,
                          }).format(discountAmount)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center py-4 mt-2 border-t">
                      <span className="text-[13px] font-medium">Total</span>
                      <span className="text-xl font-medium font-serif tracking-tight">
                        {new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: selectedCurrency,
                        }).format(totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes & Payment Block */}
                <div className="flex-1 flex flex-col gap-6 mt-10">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        Payment Details
                      </span>
                      <FormField
                        control={form.control}
                        name="paymentDetails"
                        render={({ field }) => (
                          <FormItem className="h-28 space-y-0">
                            <FormControl>
                              <HashTextarea
                                hasValue={!!field.value}
                                placeholder="Bank account, PayPal, etc..."
                                {...field}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        Note
                      </span>
                      <FormField
                        control={form.control}
                        name="noteDetails"
                        render={({ field }) => (
                          <FormItem className="h-28 space-y-0">
                            <FormControl>
                              <HashTextarea
                                hasValue={!!field.value}
                                placeholder="Thank you for your business!"
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
        <div className="border-t border-border bg-background py-4 px-10 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <InvoiceSettings
              settings={form.watch()}
              onUpdate={(key, value) =>
                form.setValue(key as any, value, { shouldDirty: true })
              }
              onRename={() => {
                const newName = prompt(
                  "Enter template name:",
                  form.getValues("templateName"),
                );
                if (newName) form.setValue("templateName", newName);
              }}
            />
            <div className="flex items-center gap-1.5 px-3 py-1.5 border rounded-md bg-muted/30">
              <span className="text-xs font-medium">Template:</span>
              <span className="text-xs text-muted-foreground">
                {form.watch("templateName")}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form="invoice-form" disabled={loading}>
              {loading ? "Saving..." : isEditing ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
