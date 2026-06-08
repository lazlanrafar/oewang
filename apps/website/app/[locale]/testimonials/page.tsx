import { cookies } from "next/headers";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { CTASection } from "@/components/sections/cta-section";
import { getDictionary } from "@/lib/translations";

export const metadata = {
  title: "Customer Stories – oewang",
  description: "See how people use Oewang to track daily money with less manual spreadsheet work.",
};

export default async function TestimonialsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has(process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-session");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const stories = [
    {
      name: "Solo consultant",
      quote: "I finally see every transaction without opening five tools.",
      result: "Reduced weekly finance admin from 5 hours to 1.5 hours.",
    },
    {
      name: "Design studio",
      quote: "Shared workspace reviews made billing and tracking much clearer.",
      result: "Improved invoice follow-up and payment visibility across the team.",
    },
    {
      name: "Small agency",
      quote: "We stopped losing receipts and got month-end under control.",
      result: "Cleaner accounting export with fewer missing documents.",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
      <main className="flex-1 pt-24">
        <section className="border-border/70 border-b py-16 sm:py-20">
          <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-8">
            <h1 className="max-w-4xl font-serif text-4xl tracking-tight sm:text-6xl">Customer stories</h1>
            <p className="mt-5 max-w-3xl text-base text-muted-foreground sm:text-lg">
              Real usage patterns from people tracking daily transactions, receipts, bills, and side-income in one
              workspace.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-[1100px] space-y-4 px-4 sm:px-6 lg:px-8">
            {stories.map((story) => (
              <article key={story.name} className="border border-border/70 bg-background p-6">
                <p className="mb-4 font-serif text-3xl leading-tight">“{story.quote}”</p>
                <p className="mb-1 text-muted-foreground text-sm">{story.name}</p>
                <p className="text-foreground text-sm">{story.result}</p>
              </article>
            ))}
          </div>
        </section>

        <CTASection isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
      </main>
      <Footer locale={locale} dictionary={dictionary} />
    </div>
  );
}
