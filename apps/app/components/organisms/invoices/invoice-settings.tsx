"use client";

import type { Dictionary } from "@workspace/dictionaries";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  SelectCurrency,
} from "@workspace/ui";
import {
  Calculator,
  Calendar,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  FileText,
  Globe,
  Hash,
  Lock,
  Mail,
  Maximize2,
  Pencil,
  Percent,
  QrCode,
  Settings,
  Trash2,
  Type,
} from "lucide-react";

export interface InvoiceSettingsProps {
  settings: {
    invoiceSize: string;
    dateFormat: string;
    paymentTerms: string;
    currency: string;
    templateName: string;
    invoiceSettings: {
      salesTax: boolean;
      vat: boolean;
      lineItemTax: boolean;
      discount: boolean;
      decimals: boolean;
      units: boolean;
      qrCode: boolean;
    };
  };
  onUpdate: (key: string, value: string | boolean | Record<string, boolean>) => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  dictionary: Dictionary;
}

export function InvoiceSettings({
  settings,
  onUpdate,
  onRename,
  onDuplicate,
  onDelete,
  dictionary,
}: InvoiceSettingsProps) {
  const dict = dictionary.invoices;
  const updateNestedSetting = (key: string, value: boolean) => {
    onUpdate("invoiceSettings", {
      ...settings.invoiceSettings,
      [key]: value,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
          <Settings className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuGroup>
          {/* Invoice Sub-menu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FileText className="mr-2 h-4 w-4" />
              <span>{dict.settings.invoice || "Invoice"}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-48">
                {/* Invoice Size */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Maximize2 className="mr-2 h-4 w-4" />
                    <span>{dict.settings.size || "Invoice size"}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup
                        value={settings?.invoiceSize}
                        onValueChange={(v) => onUpdate("invoiceSize", v)}
                      >
                        <DropdownMenuRadioItem value="A4">A4</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="Letter">Letter</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>

                {/* Currency */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <DollarSign className="mr-2 h-4 w-4" />
                    <span>{dict.settings.currency || "Currency"}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="border-none p-0 shadow-none">
                      <SelectCurrency
                        value={settings?.currency}
                        onSelect={(c) => onUpdate("currency", c.code)}
                        className="border-none shadow-none"
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>

                {/* Date Format */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Calendar className="mr-2 h-4 w-4" />
                    <span>{dict.settings.date_format || "Date format"}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup
                        value={settings?.dateFormat}
                        onValueChange={(v) => onUpdate("dateFormat", v)}
                      >
                        <DropdownMenuRadioItem value="DD/MM/YYYY">DD/MM/YYYY</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="MM/DD/YYYY">MM/DD/YYYY</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="YYYY-MM-DD">YYYY-MM-DD</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="dd.MM.yyyy">dd.MM.yyyy</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>

                {/* Payment Terms */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Clock className="mr-2 h-4 w-4" />
                    <span>{dict.settings.payment_terms || "Payment terms"}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="max-h-[300px] overflow-y-auto">
                      <DropdownMenuRadioGroup
                        value={settings?.paymentTerms}
                        onValueChange={(v) => onUpdate("paymentTerms", v)}
                      >
                        {["Due on Receipt", "Net 7", "Net 10", "Net 15", "Net 30", "Net 45", "Net 60", "Net 90"].map(
                          (term) => (
                            <DropdownMenuRadioItem key={term} value={term}>
                              {dict.settings.terms[term.toLowerCase().replace(/ /g, "_")] || term}
                            </DropdownMenuRadioItem>
                          ),
                        )}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          {/* Tax & Pricing Sub-menu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Calculator className="mr-2 h-4 w-4" />
              <span>{dict.settings.tax_pricing || "Tax & Pricing"}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuCheckboxItem
                  checked={settings?.invoiceSettings.salesTax}
                  onCheckedChange={(v) => updateNestedSetting("salesTax", v)}
                >
                  <Calculator className="mr-2 h-4 w-4" />
                  <span>{dict.settings.sales_tax || "Sales tax"}</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings?.invoiceSettings.vat}
                  onCheckedChange={(v) => updateNestedSetting("vat", v)}
                >
                  <Percent className="mr-2 h-4 w-4" />
                  <span>{dict.settings.vat || "VAT"}</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings?.invoiceSettings.lineItemTax}
                  onCheckedChange={(v) => updateNestedSetting("lineItemTax", v)}
                >
                  <Hash className="mr-2 h-4 w-4" />
                  <span>{dict.settings.line_item_tax || "Line item tax"}</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings?.invoiceSettings.discount}
                  onCheckedChange={(v) => updateNestedSetting("discount", v)}
                >
                  <Percent className="mr-2 h-4 w-4" />
                  <span>{dict.settings.discount || "Discount"}</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings?.invoiceSettings.decimals}
                  onCheckedChange={(v) => updateNestedSetting("decimals", v)}
                >
                  <Type className="mr-2 h-4 w-4" />
                  <span>{dict.settings.decimals || "Decimals"}</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings?.invoiceSettings.units}
                  onCheckedChange={(v) => updateNestedSetting("units", v)}
                >
                  <Type className="mr-2 h-4 w-4" />
                  <span>{dict.settings.units || "Units"}</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings?.invoiceSettings.qrCode}
                  onCheckedChange={(v) => updateNestedSetting("qrCode", v)}
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  <span>{dict.settings.qr_code || "QR code"}</span>
                </DropdownMenuCheckboxItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuItem disabled>
            <Mail className="mr-2 h-4 w-4" />
            <span>{dictionary.common.email || "Email"}</span>
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/50" />
          </DropdownMenuItem>

          <DropdownMenuItem disabled={settings?.invoiceSettings.qrCode}>
            <CreditCard className="mr-2 h-4 w-4" />
            <span>{dict.settings.payments || "Payments"}</span>
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/50" />
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5 font-normal text-[10px] text-muted-foreground uppercase tracking-wider">
            {dict.settings.sharing || "Sharing"}
          </DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={(settings as InvoiceSettingsProps["settings"]).invoiceSettings.qrCode}
            onCheckedChange={(v) => updateNestedSetting("qrCode", v)}
          >
            <Globe className="mr-2 h-4 w-4" />
            <span>{dict.details.public_sharing || "Public view"}</span>
          </DropdownMenuCheckboxItem>

          {(settings as InvoiceSettingsProps["settings"] & { isPublic?: boolean }).isPublic && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Lock className="mr-2 h-4 w-4" />
                <span>{dict.details.public_sharing || "Access code"}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-48 p-2">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-muted-foreground uppercase">
                      {dict.details.set_access_code || "Set access code"}
                    </span>
                    <input
                      type="text"
                      placeholder={dict.details.set_access_code || "Enter code..."}
                      className="w-full rounded-md border-none bg-muted p-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                      value={(settings as InvoiceSettingsProps["settings"] & { accessCode?: string }).accessCode ?? ""}
                      onChange={(e) => onUpdate("accessCode", e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <p className="text-[9px] text-muted-foreground">
                      {dict.details.access_code_description || "Visitors must enter this code to view the invoice."}
                    </p>
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="mr-2 h-4 w-4" />
            <span>{dict.actions.rename_template || "Rename template"}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="mr-2 h-4 w-4" />
            <span>{dict.actions.duplicate_template || "Duplicate template"}</span>
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete} className="text-red-500">
            <Trash2 className="mr-2 h-4 w-4" />
            <span>{dict.actions.delete_template || "Delete template"}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
