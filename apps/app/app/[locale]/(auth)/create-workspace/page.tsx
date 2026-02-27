"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { createBrowserClient } from "@workspace/supabase/client";
import { Button } from "@workspace/ui";
import { Building2, Globe } from "lucide-react";

import { CurrencySelector } from "@/components/setting/currency-selector";
import { CountrySelector } from "@workspace/ui";

import { createWorkspaceAction } from "../../../../actions/auth.actions";

export default function CreateWorkspacePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [country, setCountry] = useState("Indonesia");
  const [currency, setCurrency] = useState({ code: "IDR", symbol: "Rp" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not logged in (client-side backup)
  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
      }
    };
    checkAuth();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    const result = await createWorkspaceAction({
      name: name.trim(),
      country,
      mainCurrencyCode: currency.code,
      mainCurrencySymbol: currency.symbol,
    });

    if (result.success) {
      // Success will redirect automatically via createWorkspaceAction
    } else {
      setError(result.error);
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[500px]">
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10">
          <Building2 className="size-6 text-primary" />
        </div>
        <h1 className="text-[28px] tracking-tight">Business details</h1>
        <p className="text-muted-foreground text-sm leading-normal">
          Add company details so amounts, currency, tax, and reporting periods
          line up correctly across insights, invoices and exports.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="workspace-name" className="text-sm font-medium">
            Company name
          </label>
          <input
            id="workspace-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Acme Marketing or Acme Co"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            required
            // biome-ignore lint/a11y/noAutofocus: UX requirement
            autoFocus
            disabled={loading}
          />
        </div>

        <div className="space-y-2 flex flex-col">
          <span className="text-sm font-medium">Country</span>
          <CountrySelector value={country} onSelect={setCountry} />
        </div>

        <div className="space-y-2 flex flex-col">
          <span className="text-sm font-medium">Base currency</span>
          <CurrencySelector
            value={currency.code}
            onSelect={(c) => setCurrency({ code: c.code, symbol: c.symbol })}
          />
          <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
            If you have multiple accounts in different currencies, this will be
            the default currency for your company. You can change it later.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm border border-destructive/20">
            {error}
          </div>
        )}

        <div className="pt-8">
          <Button
            type="submit"
            className="w-full cursor-pointer"
            disabled={loading || !name.trim()}
            loading={loading}
          >
            {loading ? "Creating..." : "Continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
