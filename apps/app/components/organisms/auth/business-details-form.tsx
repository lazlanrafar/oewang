"use client";

import { Button, Input, Label, SelectCountry, SelectCurrency } from "@workspace/ui";
import { Loader2 } from "lucide-react";

interface BusinessDetailsFormProps {
  name: string;
  setName: (val: string) => void;
  country: string;
  onCountryChange: (val: string) => void;
  currencyCode: string;
  onCurrencySelect: (curr: { code: string; symbol: string }) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  loading?: boolean;
}

export function BusinessDetailsForm({
  name,
  setName,
  country,
  onCountryChange,
  currencyCode,
  onCurrencySelect,
  onSubmit,
  submitLabel,
  loading = false,
}: BusinessDetailsFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="workspace-name">Company name</Label>
        <Input
          id="workspace-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Acme Marketing or Acme Co"
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label>Country</Label>
        <SelectCountry value={country} onSelect={onCountryChange} />
      </div>

      <div className="space-y-2">
        <Label>Base currency</Label>
        <SelectCurrency value={currencyCode} onSelect={onCurrencySelect} />
        <p className="text-muted-foreground text-xs leading-relaxed">You can change this later from settings?.</p>
      </div>

      <div className="pt-2">
        <Button type="submit" className="w-full" disabled={!name.trim() || loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" />
              Loading...
            </span>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}
