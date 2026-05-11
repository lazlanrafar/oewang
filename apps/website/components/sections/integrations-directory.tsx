"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { PublicIntegration } from "@/lib/integrations-public";
import {
  GmailLogo,
  OutlookLogo,
  QuickBooksLogo,
  XeroLogo,
  TelegramLogo,
  WhatsAppLogo,
  GoogleDriveLogo,
  DropboxLogo,
  SlackLogo,
  StripeLogo,
} from "@workspace/integrations/logos";

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
      <div className="size-11 flex items-center justify-center bg-background">
        <Logo />
      </div>
    );
  }

  return (
    <div className="size-11 border border-border flex items-center justify-center text-sm font-semibold bg-background">
      {name.slice(0, 1)}
    </div>
  );
}

export function IntegrationsDirectory({
  locale,
  integrations,
}: {
  locale: string;
  integrations: PublicIntegration[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const categories = useMemo(() => {
    return [...new Set(integrations.map((item) => item.category))].sort();
  }, [integrations]);

  const selectedCategory = searchParams.get("category") ?? "All";

  const filtered =
    selectedCategory === "All"
      ? integrations
      : integrations.filter((item) => item.category === selectedCategory);

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
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 border-b border-border/70 pb-5">
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setFilter("All")}
              className={`px-3 py-1.5 text-xs border transition-colors ${
                selectedCategory === "All"
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({integrations.length})
            </button>

            {categories.map((category) => {
              const count = integrations.filter(
                (item) => item.category === category,
              ).length;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setFilter(category)}
                  className={`px-3 py-1.5 text-xs border transition-colors ${
                    selectedCategory === category
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {category} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <Link
              key={item.slug}
              href={`/${locale}/integrations/${item.slug}`}
              className="group border border-border/70 p-5 bg-background hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <IntegrationLogo slug={item.slug} name={item.name} />
                <span
                  className={`text-[10px] uppercase tracking-[0.16em] ${
                    item.status === "available"
                      ? "text-green-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {item.status === "available" ? "Available" : "Coming soon"}
                </span>
              </div>

              <h3 className="font-medium text-lg mb-2">{item.name}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed min-h-[60px]">
                {item.description}
              </p>

              <div className="mt-5 inline-flex items-center gap-2 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                View integration details
                <ArrowRight className="size-3.5" />
              </div>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="border border-border p-8 text-center mt-4">
            <p className="text-sm text-muted-foreground">
              No integrations found for this filter.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export function IntegrationLogoBadge({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  return <IntegrationLogo slug={slug} name={name} />;
}
