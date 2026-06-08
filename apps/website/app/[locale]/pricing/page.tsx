import { cookies } from "next/headers";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { CTASection } from "@/components/sections/cta-section";
import { FAQSection } from "@/components/sections/faq-section";
import { PricingSection } from "@/components/sections/pricing-section";
import { getDictionary } from "@/lib/translations";

const SEO_COPY = {
  en: {
    title: "Pricing",
    description:
      "Affordable pricing for daily personal finance tracking in Indonesia. Start free and upgrade from Rp39.9k.",
  },
  id: {
    title: "Harga",
    description:
      "Harga terjangkau untuk tracking keuangan pribadi harian di Indonesia. Mulai gratis dan upgrade dari Rp39,9 ribu.",
  },
  ja: {
    title: "料金",
    description: "インドネシアの日々の個人資金管理向けの手頃な料金。無料で開始し、Rp39.9kからアップグレードできます。",
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const seo = SEO_COPY[locale as keyof typeof SEO_COPY] ?? SEO_COPY.en;

  return {
    title: `${seo.title} – oewang`,
    description: seo.description,
  };
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);

  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has(process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-session");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="flex min-h-screen flex-col">
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />

      <main className="flex-1 pt-24">
        <PricingSection appUrl={appUrl} locale={locale} dictionary={dictionary} />

        <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
          <div className="h-px w-full border-border/70 border-t" />
        </div>

        <FAQSection />

        <CTASection isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
      </main>

      <Footer locale={locale} dictionary={dictionary} />
    </div>
  );
}
