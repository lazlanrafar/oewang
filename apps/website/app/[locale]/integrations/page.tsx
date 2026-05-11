import { cookies } from "next/headers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CTASection } from "@/components/sections/cta-section";
import { IntegrationsDirectory } from "@/components/sections/integrations-directory";
import { getDictionary } from "@/lib/translations";
import { getPublicIntegrations } from "@/lib/integrations-public";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const copy = {
    en: {
      title: "Integrations – oewang",
      description:
        "Connect Oewang with email, accounting, messaging, and storage tools to automate finance workflows.",
    },
    id: {
      title: "Integrasi – oewang",
      description:
        "Hubungkan Oewang dengan email, accounting, messaging, dan storage untuk otomatisasi alur keuangan.",
    },
    ja: {
      title: "連携 – oewang",
      description:
        "Oewangをメール、会計、メッセージ、ストレージツールと連携し、財務ワークフローを自動化します。",
    },
  };

  const seo = copy[locale as keyof typeof copy] ?? copy.en;

  return {
    title: seo.title,
    description: seo.description,
  };
}

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);

  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has(
    process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-session",
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const integrations = await getPublicIntegrations();

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        isLoggedIn={isLoggedIn}
        appUrl={appUrl}
        locale={locale}
        dictionary={dictionary}
      />

      <main className="flex-1 pt-24">
        <section className="py-16 sm:py-20 border-b border-border/70">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
              Integration Directory
            </p>
            <h1 className="font-serif text-4xl sm:text-6xl tracking-tight max-w-3xl">
              Connect your finance workflow with the tools you already use
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg mt-5 max-w-2xl">
              Browse available integrations and open each detail page to learn capabilities,
              setup steps, and how it fits personal or team workspaces.
            </p>
          </div>
        </section>

        <IntegrationsDirectory locale={locale} integrations={integrations} />

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
