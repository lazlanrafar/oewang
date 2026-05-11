import { cookies } from "next/headers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CTASection } from "@/components/sections/cta-section";
import { getDictionary } from "@/lib/translations";

export const metadata = {
  title: "Pre-accounting – oewang",
  description: "Prepare transaction records and documents before month-end accounting handoff.",
};

export default async function PreAccountingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has(process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-session");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const steps = [
    { title: "Collect", desc: "Sync account movements and import receipts from inbox, chat, and uploads." },
    { title: "Match", desc: "Map documents to transactions and surface missing attachments before month-end." },
    { title: "Categorize", desc: "Keep categories and tax context consistent across personal and workspace operations." },
    { title: "Export", desc: "Send accountant-ready records with clear status and clean reconciliation history." },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
      <main className="flex-1 pt-24">
        <section className="py-16 sm:py-20 border-b border-border/70">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="font-serif text-4xl sm:text-6xl tracking-tight max-w-4xl">Pre-accounting, handled</h1>
            <p className="text-muted-foreground text-base sm:text-lg mt-5 max-w-3xl">Keep your books operationally ready before accountant handoff, with fewer missing files and fewer manual checks.</p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            {steps.map((item) => (
              <article key={item.title} className="border border-border/70 p-5 bg-background">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Process</p>
                <h2 className="font-serif text-2xl mb-3">{item.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
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
