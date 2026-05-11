import { cookies } from "next/headers";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CTASection } from "@/components/sections/cta-section";
import { getDictionary } from "@/lib/translations";
import {
  CreditCard,
  Bot,
  FileText,
  LayoutDashboard,
  ArrowRight,
  Users,
  Clock3,
  FolderOpen,
  ReceiptText,
} from "lucide-react";
import { FEATURE_DETAILS } from "@/lib/feature-details";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const titles = {
    en: "Features – oewang",
    id: "Fitur – oewang",
    ja: "機能 – oewang",
  };

  const descriptions = {
    en: "Explore Oewang features for transaction tracking, AI insights, invoicing, and team collaboration.",
    id: "Jelajahi fitur Oewang untuk pelacakan transaksi, insight AI, invoice, dan kolaborasi tim.",
    ja: "取引管理、AIインサイト、請求、チーム共同作業のためのOewang機能をご覧ください。",
  };

  return {
    title: titles[locale as keyof typeof titles] ?? titles.en,
    description:
      descriptions[locale as keyof typeof descriptions] ?? descriptions.en,
  };
}

export default async function FeaturesPage({
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

  const features = [
    { slug: "invoicing", icon: FileText },
    { slug: "customers", icon: Users },
    { slug: "transactions", icon: CreditCard },
    { slug: "files", icon: FolderOpen },
    { slug: "inbox", icon: ReceiptText },
    { slug: "exports", icon: LayoutDashboard },
    { slug: "time-tracking", icon: Clock3 },
    { slug: "assistant", icon: Bot },
  ] as const;

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        isLoggedIn={isLoggedIn}
        appUrl={appUrl}
        locale={locale}
        dictionary={dictionary}
      />

      <main className="flex-1 pt-24">
        <section className="py-14 sm:py-20">
          <div className="max-w-[900px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="font-serif text-3xl sm:text-5xl tracking-tight text-foreground mb-5">
              {dictionary.features.title}
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg">
              {dictionary.howItWorks.subtitle}
            </p>
          </div>
        </section>

        <section className="pb-16 sm:pb-20">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              const detail = FEATURE_DETAILS[feature.slug];

              return (
                <Link
                  key={detail.title}
                  href={`/${locale}/features/${feature.slug}`}
                  className="rounded-none border border-border/70 bg-background p-6"
                >
                  <div className="size-10 rounded-none border border-border flex items-center justify-center mb-4">
                    <Icon className="size-5 text-muted-foreground" />
                  </div>
                  <h2 className="font-serif text-2xl tracking-tight mb-2">{detail.title}</h2>
                  <p className="text-muted-foreground text-sm mb-4">{detail.subtitle}</p>

                  <div className="space-y-2">
                    {detail.points.slice(0, 3).map((item) => (
                      <div key={item} className="flex items-start gap-2.5">
                        <span className="mt-1.5 size-1.5 rounded-none bg-foreground" />
                        <span className="text-sm">{item}</span>
                      </div>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 mt-8">
            <Link
              href={`/${locale}/pricing`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Explore pricing and plans
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

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
