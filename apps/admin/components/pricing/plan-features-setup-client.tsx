"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui";
import { Plus, Sliders, CheckCircle2, ListFilter } from "lucide-react";

export type PlanFeatureItem = {
  id: string;
  code: string;
  name: string;
  description: string;
  type: "boolean" | "numeric_limit";
  unit?: string;
  defaultValue?: string;
  isActive: boolean;
};

const initialFeatures: PlanFeatureItem[] = [
  {
    id: "feat_1",
    code: "max_workspaces",
    name: "Workspace Quota",
    description: "Maximum number of workspaces a user can create or own",
    type: "numeric_limit",
    unit: "Workspaces",
    defaultValue: "1",
    isActive: true,
  },
  {
    id: "feat_2",
    code: "max_ai_tokens",
    name: "Monthly AI Token Limit",
    description: "Total LLM tokens allocated per monthly billing cycle",
    type: "numeric_limit",
    unit: "Tokens",
    defaultValue: "100000",
    isActive: true,
  },
  {
    id: "feat_3",
    code: "max_vault_size_mb",
    name: "Vault Cloud Storage",
    description: "Total size limit for uploaded receipts and attachments",
    type: "numeric_limit",
    unit: "MB",
    defaultValue: "100",
    isActive: true,
  },
  {
    id: "feat_4",
    code: "ocr_receipt_scan",
    name: "AI OCR Receipt Scanning",
    description: "Automated receipt extraction and transaction auto-fill",
    type: "boolean",
    defaultValue: "true",
    isActive: true,
  },
  {
    id: "feat_5",
    code: "custom_categories",
    name: "Custom Category Icons & Colors",
    description: "Allows unlimited custom category tagging",
    type: "boolean",
    defaultValue: "true",
    isActive: true,
  },
  {
    id: "feat_6",
    code: "export_reports",
    name: "Financial Reports Export (CSV / PDF)",
    description: "Export financial statement data for tax and accountant audits",
    type: "boolean",
    defaultValue: "true",
    isActive: true,
  },
];

export function PlanFeaturesSetupClient() {
  const [features, setFeatures] = useState<PlanFeatureItem[]>(initialFeatures);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"boolean" | "numeric_limit">("boolean");
  const [unit, setUnit] = useState("");
  const [defaultValue, setDefaultValue] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const newFeature: PlanFeatureItem = {
      id: `feat_${Date.now()}`,
      code: code.trim().toLowerCase().replaceAll(" ", "_"),
      name,
      description,
      type,
      unit: type === "numeric_limit" ? unit : undefined,
      defaultValue,
      isActive: true,
    };
    setFeatures([...features, newFeature]);
    setIsOpen(false);
    setName("");
    setCode("");
    setDescription("");
    setType("boolean");
    setUnit("");
    setDefaultValue("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="font-semibold text-lg tracking-tight uppercase">Plan Features Catalog</h1>
          <p className="text-muted-foreground text-xs">
            Manage global feature items and customizable limits used by subscription pricing plans.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-none text-xs">
              <Plus className="mr-2 size-3.5" /> Add Feature
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-none sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold uppercase tracking-wider">New Feature Item</DialogTitle>
              <DialogDescription className="text-xs">
                Create a global feature definition that can be attached and overridden in pricing tiers.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">Feature Name</Label>
                <Input
                  id="name"
                  required
                  placeholder="e.g. Max Workspace Count"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!code) setCode(e.target.value.toLowerCase().replaceAll(" ", "_"));
                  }}
                  className="rounded-none text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="code" className="text-xs">Unique Feature Code</Label>
                <Input
                  id="code"
                  required
                  placeholder="e.g. max_workspaces"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="rounded-none text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="type" className="text-xs">Feature Type</Label>
                <Select
                  value={type}
                  onValueChange={(val: "boolean" | "numeric_limit") => setType(val)}
                >
                  <SelectTrigger className="rounded-none text-xs">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none text-xs">
                    <SelectItem value="boolean">Boolean (Enabled / Disabled)</SelectItem>
                    <SelectItem value="numeric_limit">Numeric Limit (Overridable Quota)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {type === "numeric_limit" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="unit" className="text-xs">Unit</Label>
                    <Input
                      id="unit"
                      placeholder="e.g. Tokens, MB"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="rounded-none text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="defaultVal" className="text-xs">Default Value</Label>
                    <Input
                      id="defaultVal"
                      placeholder="e.g. 100"
                      value={defaultValue}
                      onChange={(e) => setDefaultValue(e.target.value)}
                      className="rounded-none text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="desc" className="text-xs">Description</Label>
                <Textarea
                  id="desc"
                  rows={2}
                  placeholder="Brief explanation of the feature..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-none text-xs"
                />
              </div>

              <Button type="submit" className="w-full rounded-none text-xs">
                Create Feature Item
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feat) => (
          <Card key={feat.id} className="rounded-none border bg-background shadow-none">
            <CardHeader className="border-b p-4 pb-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground border px-1.5 py-0.5">
                  {feat.code}
                </span>
                <span className="text-[10px] uppercase font-semibold text-primary">
                  {feat.type === "numeric_limit" ? `Limit (${feat.unit || "Count"})` : "Toggle"}
                </span>
              </div>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider mt-2">{feat.name}</CardTitle>
              <CardDescription className="text-[11px] leading-relaxed mt-1">
                {feat.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-[11px]">Default:</span>
                <span className="font-mono font-medium">
                  {feat.defaultValue || (feat.type === "boolean" ? "true" : "-")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500 text-[10px] font-semibold flex items-center gap-1">
                  <CheckCircle2 className="size-3" /> Active
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
