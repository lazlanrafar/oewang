import { cookies } from "next/headers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { PricingSection } from "@/components/sections/pricing-section";
import { FAQSection } from "@/components/sections/faq-section";
import { CTASection } from "@/components/sections/cta-section";
import { getDictionary } from "@/lib/translations";

const SEO_COPY = {
  en: {
    title: "Pricing",
    description:
      "Simple pricing for personal users, founders, and teams. Start free and upgrade as your workspace grows.",
  },
  id: {
    title: "Harga",
    description:
      "Harga sederhana untuk pengguna pribadi, founder, dan tim. Mulai gratis dan upgrade saat workspace bertumbuh.",
  },
  ja: {
    title: "料金",
    description:
      "個人ユーザー、創業者、チーム向けのシンプルな料金。無料で開始し、成長に合わせてアップグレードできます。",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const seo = SEO_COPY[locale as keyof typeof SEO_COPY] ?? SEO_COPY.en;

  return {
    title: `${seo.title} – oewang`,
    description: seo.description,
  };
}

export default async function PricingPage({
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

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        isLoggedIn={isLoggedIn}
        appUrl={appUrl}
        locale={locale}
        dictionary={dictionary}
      />

      <main className="flex-1 pt-24">
        <PricingSection appUrl={appUrl} locale={locale} dictionary={dictionary} />

        <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-px w-full border-t border-border/70" />
        </div>

        <FAQSection />

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
