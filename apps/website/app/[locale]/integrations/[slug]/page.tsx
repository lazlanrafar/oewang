import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CTASection } from "@/components/sections/cta-section";
import { IntegrationLogoBadge } from "@/components/sections/integrations-directory";
import { getDictionary } from "@/lib/translations";
import { getPublicIntegrationBySlug, getPublicIntegrations } from "@/lib/integrations-public";
import type { PublicIntegration } from "@/lib/integrations-public";
import { ArrowLeft, ArrowRight } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const item = await getPublicIntegrationBySlug(slug);

  if (!item) {
    return {
      title: "Integration Not Found – oewang",
      description: "Requested integration page is not available.",
    };
  }

  return {
    title: `${item.name} Integration – oewang`,
    description: item.description,
  };
}

export async function generateStaticParams() {
  const integrations = await getPublicIntegrations();
  return integrations.map((item: PublicIntegration) => ({
    slug: item.slug,
  }));
}

export default async function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const dictionary = getDictionary(locale);

  const item = await getPublicIntegrationBySlug(slug);
  if (!item) {
    notFound();
  }

  const integrations = await getPublicIntegrations();
  const related = integrations
    .filter(
      (entry: PublicIntegration) =>
        entry.category === item.category && entry.slug !== item.slug,
    )
    .slice(0, 3);

  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has(
    process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-session",
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        isLoggedIn={isLoggedIn}
        appUrl={appUrl}
        locale={locale}
        dictionary={dictionary}
      />

      <main className="flex-1 pt-24">
        <section className="py-12 border-b border-border/70">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
            <Link
              href={`/${locale}/integrations`}
              className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft className="size-3.5" />
              Back to integrations
            </Link>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
              <div>
                <div className="mb-4">
                  <IntegrationLogoBadge slug={item.slug} name={item.name} />
                </div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
                  {item.category}
                </p>
                <h1 className="font-serif text-4xl sm:text-6xl tracking-tight mb-4">
                  {item.name}
                </h1>
                <p className="text-muted-foreground text-base sm:text-lg max-w-3xl leading-relaxed">
                  {item.longDescription}
                </p>
              </div>

              <div className="border border-border p-4 min-w-[180px]">
                <p className="text-xs text-muted-foreground mb-2">Status</p>
                <p
                  className={`text-sm font-medium ${
                    item.status === "available" ? "text-green-600" : "text-muted-foreground"
                  }`}
                >
                  {item.status === "available" ? "Available" : "Coming soon"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-14 sm:py-16">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10">
            <article>
              <h2 className="font-serif text-2xl tracking-tight mb-4">What you can do</h2>
              <div className="space-y-3">
                {item.features.map((feature: string) => (
                  <div key={feature} className="flex items-start gap-2.5 border-b border-border/60 pb-3">
                    <span className="mt-1.5 size-1.5 bg-foreground" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </article>

            <article>
              <h2 className="font-serif text-2xl tracking-tight mb-4">Setup steps</h2>
              <div className="space-y-3">
                {item.setupSteps.map((step: string, index: number) => (
                  <div key={step} className="border border-border p-4">
                    <p className="text-xs text-muted-foreground mb-1">Step {index + 1}</p>
                    <p className="text-sm">{step}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        {related.length > 0 && (
          <section className="py-14 border-t border-border/70">
            <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="font-serif text-2xl tracking-tight mb-5">Related integrations</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {related.map((entry: PublicIntegration) => (
                  <Link
                    key={entry.slug}
                    href={`/${locale}/integrations/${entry.slug}`}
                    className="border border-border p-4 hover:bg-muted/20 transition-colors"
                  >
                    <p className="text-xs text-muted-foreground mb-2">{entry.category}</p>
                    <p className="font-medium mb-1">{entry.name}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">{entry.description}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      Open
                      <ArrowRight className="size-3.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <CTASection
          isLoggedIn={isLoggedIn}
          appUrl={appUrl}
          locale={locale}
          dictionary={dictionary}
        />
      </main>

      <Footer locale={locale} dictionary={dictionary} />
    </div>
  );
}
