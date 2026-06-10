"use client";

import { useMemo } from "react";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  DropboxLogo,
  GmailLogo,
  GoogleDriveLogo,
  OutlookLogo,
  QuickBooksLogo,
  SlackLogo,
  StripeLogo,
  TelegramLogo,
  WhatsAppLogo,
  XeroLogo,
} from "@workspace/integrations/logos";
import { ArrowRight } from "lucide-react";

import type { PublicIntegration } from "@/lib/integrations-public";

const LOGOS = {
  gmail: GmailLogo,
  outlook: OutlookLogo,
  quickbooks: QuickBooksLogo,
  xero: XeroLogo,
  telegram: TelegramLogo,
  whatsapp: WhatsAppLogo,
  "google-drive": GoogleDriveLogo,
  dropbox: DropboxLogo,
  slack: SlackLogo,
  stripe: StripeLogo,
} as const;

function IntegrationLogo({ slug, name }: { slug: string; name: string }) {
  const Logo = LOGOS[slug as keyof typeof LOGOS];

  if (Logo) {
    return (
      <div className="flex size-11 items-center justify-center bg-background">
        <Logo />
      </div>
    );
  }

  return (
    <div className="flex size-11 items-center justify-center border border-border bg-background font-semibold text-sm">
      {name.slice(0, 1)}
    </div>
  );
}

export function IntegrationsDirectory({ locale, integrations }: { locale: string; integrations: PublicIntegration[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const categories = useMemo(() => {
    return [...new Set(integrations.map((item) => item.category))].sort();
  }, [integrations]);

  const selectedCategory = searchParams.get("category") ?? "All";

  const filtered =
    selectedCategory === "All" ? integrations : integrations.filter((item) => item.category === selectedCategory);

  const setFilter = (category: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (category === "All") {
      params.delete("category");
    } else {
      params.set("category", category);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="mb-8 border-border/70 border-b pb-5">
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setFilter("All")}
              className={`border px-3 py-1.5 text-xs transition-colors ${
                selectedCategory === "All"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({integrations.length})
            </button>

            {categories.map((category) => {
              const count = integrations.filter((item) => item.category === category).length;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setFilter(category)}
                  className={`border px-3 py-1.5 text-xs transition-colors ${
                    selectedCategory === category
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {category} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <Link
              key={item.slug}
              href={`/${locale}/integrations/${item.slug}`}
              className="group border border-border/70 bg-background p-5 transition-colors hover:bg-muted/20"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <IntegrationLogo slug={item.slug} name={item.name} />
                <span
                  className={`text-[10px] uppercase tracking-[0.16em] ${
                    item.status === "available" ? "text-green-600" : "text-muted-foreground"
                  }`}
                >
                  {item.status === "available" ? "Available" : "Coming soon"}
                </span>
              </div>

              <h3 className="mb-2 font-medium text-lg">{item.name}</h3>
              <p className="min-h-[60px] text-muted-foreground text-sm leading-relaxed">{item.description}</p>

              <div className="mt-5 inline-flex items-center gap-2 text-muted-foreground text-xs transition-colors group-hover:text-foreground">
                View integration details
                <ArrowRight className="size-3.5" />
              </div>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="mt-4 border border-border p-8 text-center">
            <p className="text-muted-foreground text-sm">No integrations found for this filter.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function IntegrationLogoBadge({ slug, name }: { slug: string; name: string }) {
  return <IntegrationLogo slug={slug} name={name} />;
}
