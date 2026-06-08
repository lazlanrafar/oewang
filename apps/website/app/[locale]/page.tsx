import { cookies } from "next/headers";

import { WEBSITE_CONFIG } from "@workspace/constants";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { CTASection } from "@/components/sections/cta-section";
import { FeatureShowcases } from "@/components/sections/feature-showcase";
import { HeroSection } from "@/components/sections/hero";
import { HowItWorksSection } from "@/components/sections/how-it-works";
import { createPageMetadata, getPageUrl } from "@/lib/seo";
import { getDictionary } from "@/lib/translations";

const SEO_COPY = {
  en: {
    title: "Track every transaction, understand your money daily",
    description:
      "Oewang helps individuals and teams capture daily transactions, stay clear on spending, and get AI-powered insights — all in one workspace.",
    keywords: [
      "daily finance tracker",
      "personal finance app",
      "transaction tracker",
      "AI finance assistant",
      "multi-workspace finance",
    ],
  },
  id: {
    title: "Catat setiap transaksi, pahami keuangan Anda setiap hari",
    description:
      "Oewang membantu individu dan tim mencatat transaksi harian, memahami pengeluaran, dan mendapatkan wawasan AI — dalam satu workspace.",
    keywords: [
      "tracker keuangan harian",
      "aplikasi keuangan pribadi",
      "pelacak transaksi",
      "asisten keuangan AI",
      "keuangan multi-workspace",
    ],
  },
  ja: {
    title: "毎日の取引を記録し、お金の流れを把握する",
    description:
      "Oewangは個人とチームが毎日の取引を記録し、支出を理解し、AIによるインサイトを得られる、すべてが1つのワークスペースで完結するアプリです。",
    keywords: ["毎日の家計管理", "個人財務アプリ", "取引管理", "AIファイナンスアシスタント", "マルチワークスペース"],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const seo = SEO_COPY[locale as keyof typeof SEO_COPY] ?? SEO_COPY.en;

  return createPageMetadata({
    locale,
    path: "",
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);

  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has(process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-session");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const seo = SEO_COPY[locale as keyof typeof SEO_COPY] ?? SEO_COPY.en;
  const pageUrl = getPageUrl(locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Oewang",
        url: WEBSITE_CONFIG.url,
        logo: WEBSITE_CONFIG.logo,
      },
      {
        "@type": "SoftwareApplication",
        name: "Oewang",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        url: pageUrl,
        description: seo.description,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data requires dangerouslySetInnerHTML */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />

      <main className="flex-1">
        <HeroSection isLoggedIn={isLoggedIn} appUrl={appUrl} dictionary={dictionary} />

        <HowItWorksSection dictionary={dictionary} />

        <FeatureShowcases dictionary={dictionary} />

        <CTASection isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
      </main>

      <Footer locale={locale} dictionary={dictionary} />
    </div>
  );
}
