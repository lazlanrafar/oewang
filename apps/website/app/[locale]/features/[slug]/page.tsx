import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CTASection } from "@/components/sections/cta-section";
import { getDictionary } from "@/lib/translations";
import { FEATURE_DETAILS } from "@/lib/feature-details";
import { ArrowLeft } from "lucide-react";

const FEATURE_KEYS = Object.keys(FEATURE_DETAILS) as Array<keyof typeof FEATURE_DETAILS>;

export async function generateStaticParams() {
  return FEATURE_KEYS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = FEATURE_DETAILS[slug as keyof typeof FEATURE_DETAILS];

  if (!detail) {
    return { title: "Feature – oewang" };
  }

  return {
    title: `${detail.title} – oewang`,
    description: detail.subtitle,
  };
}

export default async function FeatureDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const detail = FEATURE_DETAILS[slug as keyof typeof FEATURE_DETAILS];

  if (!detail) {
    notFound();
  }

  const dictionary = getDictionary(locale);
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has(process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-session");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="flex flex-col min-h-screen">
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
      <main className="flex-1 pt-24">
        <section className="py-12 border-b border-border/70">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
            <Link
              href={`/${locale}/features`}
              className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-7"
            >
              <ArrowLeft className="size-3.5" />
              Back to features
            </Link>

            <h1 className="font-serif text-4xl sm:text-6xl tracking-tight max-w-4xl">{detail.title}</h1>
            <p className="text-muted-foreground text-base sm:text-lg mt-5 max-w-3xl">{detail.intro}</p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <article className="border border-border/70 p-6">
              <h2 className="font-serif text-3xl mb-4">Core capabilities</h2>
              <p className="text-sm text-muted-foreground">{detail.subtitle}</p>
            </article>
            <article className="border border-border/70 p-6">
              <h2 className="font-serif text-3xl mb-4">What you can do</h2>
              <div className="space-y-2.5">
                {detail.points.map((point) => (
                  <div key={point} className="flex items-start gap-2.5">
                    <span className="mt-1.5 size-1.5 bg-foreground" />
                    <span className="text-sm">{point}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <CTASection isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
      </main>
      <Footer locale={locale} dictionary={dictionary} />
    </div>
  );
}
