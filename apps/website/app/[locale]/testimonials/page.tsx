import { cookies } from "next/headers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CTASection } from "@/components/sections/cta-section";
import { getDictionary } from "@/lib/translations";

export const metadata = {
  title: "Customer Stories – oewang",
  description: "See how founders and teams use Oewang to run finance operations with less manual work.",
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
    <div className="flex flex-col min-h-screen">
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
      <main className="flex-1 pt-24">
        <section className="py-16 sm:py-20 border-b border-border/70">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="font-serif text-4xl sm:text-6xl tracking-tight max-w-4xl">Customer stories</h1>
            <p className="text-muted-foreground text-base sm:text-lg mt-5 max-w-3xl">Real usage patterns from founders and teams managing transactions, invoices, and collaboration in one workspace.</p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
            {stories.map((story) => (
              <article key={story.name} className="border border-border/70 p-6 bg-background">
                <p className="font-serif text-3xl leading-tight mb-4">“{story.quote}”</p>
                <p className="text-sm text-muted-foreground mb-1">{story.name}</p>
                <p className="text-sm text-foreground">{story.result}</p>
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
