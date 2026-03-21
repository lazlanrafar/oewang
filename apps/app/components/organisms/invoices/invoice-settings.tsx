"use client";

import * as React from "react";
import {
  Settings,
  FileText,
  Percent,
  Mail,
  CreditCard,
  Maximize2,
  DollarSign,
  Calendar,
  Clock,
  Type,
  Hash,
  QrCode,
  ChevronRight,
  Calculator,
  RotateCcw,
  Copy,
  Trash2,
  Pencil,
  Globe,
  Lock,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  Button,
} from "@workspace/ui";
import { SelectCurrency } from "@workspace/ui";

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
  onUpdate: (key: string, value: any) => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

export function InvoiceSettings({
  settings,
  onUpdate,
  onRename,
  onDuplicate,
  onDelete,
}: InvoiceSettingsProps) {
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
              <span>Invoice</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-48">
                {/* Invoice Size */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Maximize2 className="mr-2 h-4 w-4" />
                    <span>Invoice size</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup
                        value={settings.invoiceSize}
                        onValueChange={(v) => onUpdate("invoiceSize", v)}
                      >
                        <DropdownMenuRadioItem value="A4">
                          A4
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="Letter">
                          Letter
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>

                {/* Currency */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <DollarSign className="mr-2 h-4 w-4" />
                    <span>Currency</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="p-0 border-none shadow-none">
                      <SelectCurrency
                        value={settings.currency}
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
                    <span>Date format</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup
                        value={settings.dateFormat}
                        onValueChange={(v) => onUpdate("dateFormat", v)}
                      >
                        <DropdownMenuRadioItem value="DD/MM/YYYY">
                          DD/MM/YYYY
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="MM/DD/YYYY">
                          MM/DD/YYYY
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="YYYY-MM-DD">
                          YYYY-MM-DD
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="dd.MM.yyyy">
                          dd.MM.yyyy
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>

                {/* Payment Terms */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Clock className="mr-2 h-4 w-4" />
                    <span>Payment terms</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="max-h-[300px] overflow-y-auto">
                      <DropdownMenuRadioGroup
                        value={settings.paymentTerms}
                        onValueChange={(v) => onUpdate("paymentTerms", v)}
                      >
                        {[
                          "Due on Receipt",
                          "Net 7",
                          "Net 10",
                          "Net 15",
                          "Net 30",
                          "Net 45",
                          "Net 60",
                          "Net 90",
                        ].map((term) => (
                          <DropdownMenuRadioItem key={term} value={term}>
                            {term}
                          </DropdownMenuRadioItem>
                        ))}
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
              <span>Tax & Pricing</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuCheckboxItem
                  checked={settings.invoiceSettings.salesTax}
                  onCheckedChange={(v) => updateNestedSetting("salesTax", v)}
                >
                  <Calculator className="mr-2 h-4 w-4" />
                  <span>Sales tax</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings.invoiceSettings.vat}
                  onCheckedChange={(v) => updateNestedSetting("vat", v)}
                >
                  <Percent className="mr-2 h-4 w-4" />
                  <span>VAT</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings.invoiceSettings.lineItemTax}
                  onCheckedChange={(v) => updateNestedSetting("lineItemTax", v)}
                >
                  <Hash className="mr-2 h-4 w-4" />
                  <span>Line item tax</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings.invoiceSettings.discount}
                  onCheckedChange={(v) => updateNestedSetting("discount", v)}
                >
                  <Percent className="mr-2 h-4 w-4" />
                  <span>Discount</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings.invoiceSettings.decimals}
                  onCheckedChange={(v) => updateNestedSetting("decimals", v)}
                >
                  <Type className="mr-2 h-4 w-4" />
                  <span>Decimals</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings.invoiceSettings.units}
                  onCheckedChange={(v) => updateNestedSetting("units", v)}
                >
                  <Type className="mr-2 h-4 w-4" />
                  <span>Units</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings.invoiceSettings.qrCode}
                  onCheckedChange={(v) => updateNestedSetting("qrCode", v)}
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  <span>QR code</span>
                </DropdownMenuCheckboxItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuItem disabled>
            <Mail className="mr-2 h-4 w-4" />
            <span>Email</span>
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/50" />
          </DropdownMenuItem>

          <DropdownMenuItem disabled={settings.invoiceSettings.qrCode}>
            <CreditCard className="mr-2 h-4 w-4" />
            <span>Payments</span>
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/50" />
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground px-2 py-1.5 uppercase tracking-wider">
            Sharing
          </DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={(settings as any).isPublic}
            onCheckedChange={(v) => onUpdate("isPublic", v)}
          >
            <Globe className="mr-2 h-4 w-4" />
            <span>Public view</span>
          </DropdownMenuCheckboxItem>

          {(settings as any).isPublic && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Lock className="mr-2 h-4 w-4" />
                <span>Access code</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="p-2 w-48">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-muted-foreground uppercase">Set access code</span>
                    <input
                      type="text"
                      placeholder="Enter code..."
                      className="w-full bg-muted border-none rounded-md p-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                      value={(settings as any).accessCode || ""}
                      onChange={(e) => onUpdate("accessCode", e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <p className="text-[9px] text-muted-foreground">
                      Visitors must enter this code to view the invoice.
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
            <span>Rename template</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="mr-2 h-4 w-4" />
            <span>Duplicate template</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={onDelete}
            className="text-red-500"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Delete template</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
