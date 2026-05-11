import { cookies } from "next/headers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { HeroSection } from "@/components/sections/hero";
import { HowItWorksSection } from "@/components/sections/how-it-works";
import { FeatureShowcases } from "@/components/sections/feature-showcase";
import { CTASection } from "@/components/sections/cta-section";
import { WEBSITE_CONFIG } from "@workspace/constants";
import { getDictionary } from "@/lib/translations";

const SEO_COPY = {
  en: {
    title: "Track personal and team transactions in one workspace",
    description:
      "Oewang helps individuals and companies track transactions, understand cash flow, and collaborate in shared workspaces with clear permissions.",
    keywords: [
      "transaction tracker",
      "personal finance workspace",
      "team finance software",
      "multi-user financial workspace",
      "cash flow tracking",
    ],
  },
  id: {
    title: "Lacak transaksi pribadi dan tim dalam satu workspace",
    description:
      "Oewang membantu individu dan perusahaan melacak transaksi, memahami arus kas, dan berkolaborasi dalam workspace bersama.",
    keywords: [
      "pelacak transaksi",
      "keuangan pribadi",
      "software keuangan tim",
      "workspace keuangan multi-user",
      "pelacakan arus kas",
    ],
  },
  ja: {
    title: "個人とチームの取引を1つのワークスペースで管理",
    description:
      "Oewangは個人と企業が取引を追跡し、キャッシュフローを把握し、共有ワークスペースで安全に共同作業できるようにします。",
    keywords: [
      "取引管理",
      "個人財務",
      "チーム財務ソフト",
      "マルチユーザー財務ワークスペース",
      "キャッシュフロー管理",
    ],
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
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    openGraph: {
      title: `Oewang · ${seo.title}`,
      description: seo.description,
      url: locale === "en" ? WEBSITE_CONFIG.url : `${WEBSITE_CONFIG.url}/${locale}`,
      images: WEBSITE_CONFIG.meta.og.images,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `Oewang · ${seo.title}`,
      description: seo.description,
      images: WEBSITE_CONFIG.meta.twitter.images,
    },
  };
}

export default async function Page({
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

  const seo = SEO_COPY[locale as keyof typeof SEO_COPY] ?? SEO_COPY.en;
  const pageUrl = locale === "en" ? WEBSITE_CONFIG.url : `${WEBSITE_CONFIG.url}/${locale}`;

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
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Can I use Oewang for personal and company finance?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes. You can manage personal finance and also collaborate with teammates in shared workspaces with role-based access.",
            },
          },
          {
            "@type": "Question",
            name: "Does Oewang support multi-user workspace access?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes. Workspaces support multiple members so teams can track transactions together while keeping permissions controlled.",
            },
          },
        ],
      },
    ],
  };

  return (
    <div className="flex flex-col min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Header
        isLoggedIn={isLoggedIn}
        appUrl={appUrl}
        locale={locale}
        dictionary={dictionary}
      />

      <main className="flex-1">
        <HeroSection
          isLoggedIn={isLoggedIn}
          appUrl={appUrl}
          locale={locale}
          dictionary={dictionary}
        />

        <HowItWorksSection dictionary={dictionary} />

        <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-px w-full border-t border-border/70" />
        </div>

        <FeatureShowcases dictionary={dictionary} />

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
