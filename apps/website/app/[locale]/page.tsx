import { cookies } from "next/headers";

import { WEBSITE_CONFIG } from "@workspace/constants";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { ChatPhone } from "@/components/sections/chat-phone";
import { CTASection } from "@/components/sections/cta-section";
import { FaqSection } from "@/components/sections/faq-section";
import { FeatureShowcases } from "@/components/sections/feature-showcase";
import { HeroSection } from "@/components/sections/hero";
import { PricingSection } from "@/components/sections/pricing-section";
import { ProductShowcase } from "@/components/sections/product-showcase";
import { SocialProof } from "@/components/sections/social-proof";
import { StatsSection } from "@/components/sections/stats";
import { ValuePillars } from "@/components/sections/value-pillars";
import { getPublicPlans } from "@/lib/pricing.server";
import { createPageMetadata, getPageUrl } from "@/lib/seo";
import { getDictionary } from "@/lib/translations";

const SEO_COPY = {
  en: {
    title: "Understand your money, effortlessly — AI finance workspace",
    description:
      "Oewang captures every transaction from receipts, chat, and CSV, then turns daily spending into clarity with AI — across personal and team workspaces.",
    keywords: [
      "AI finance tracker",
      "receipt scanning app",
      "personal finance app",
      "transaction tracker",
      "multi-workspace finance",
    ],
  },
  id: {
    title: "Pahami keuangan Anda dengan mudah — workspace keuangan AI",
    description:
      "Oewang mencatat setiap transaksi dari struk, chat, dan CSV, lalu mengubah pengeluaran harian menjadi kejelasan dengan AI — untuk workspace pribadi dan tim.",
    keywords: [
      "tracker keuangan AI",
      "aplikasi scan struk",
      "aplikasi keuangan pribadi",
      "pelacak transaksi",
      "keuangan multi-workspace",
    ],
  },
  ja: {
    title: "お金を、もっとシンプルに — AI家計ワークスペース",
    description:
      "Oewangはレシート・チャット・CSVからすべての取引を記録し、AIで日々の支出を明確にします。個人・チームのワークスペースに対応。",
    keywords: ["AI家計簿", "レシート読み取りアプリ", "個人財務アプリ", "取引管理", "マルチワークスペース"],
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

  // Live plans from the API's public pricing endpoint (base tiers only).
  const plans = await getPublicPlans();

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
        "@type": "WebSite",
        name: "Oewang",
        url: WEBSITE_CONFIG.url,
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
      {
        "@type": "FAQPage",
        mainEntity: dictionary.faq.items.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data requires dangerouslySetInnerHTML
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header stays OUTSIDE SmoothScroll (fixed, not transformed by the smoother). */}
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />

      <SmoothScroll>
        <main className="flex-1">
          <HeroSection isLoggedIn={isLoggedIn} appUrl={appUrl} dictionary={dictionary} />
          <ChatPhone dictionary={dictionary} />
          <SocialProof dictionary={dictionary} />
          <ValuePillars dictionary={dictionary} />
          <ProductShowcase dictionary={dictionary} />
          <FeatureShowcases dictionary={dictionary} />
          <StatsSection dictionary={dictionary} />
          <PricingSection appUrl={appUrl} dictionary={dictionary} plans={plans} />
          <FaqSection dictionary={dictionary} />
          <CTASection isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
        </main>

        <Footer locale={locale} dictionary={dictionary} />
      </SmoothScroll>
    </div>
  );
}
