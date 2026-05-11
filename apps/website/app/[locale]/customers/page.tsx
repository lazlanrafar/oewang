import { cookies } from "next/headers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CTASection } from "@/components/sections/cta-section";
import { getDictionary } from "@/lib/translations";

export const metadata = {
  title: "Customers – oewang",
  description: "Understand customer revenue, payment behavior, and invoice status in one place.",
};

export default async function CustomersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has(process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-session");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const blocks = [
    {
      title: "Revenue concentration",
      desc: "See who contributes most of your revenue and where concentration risk appears.",
    },
    {
      title: "Payment behavior",
      desc: "Track payer delay patterns and identify which customers require active follow-up.",
    },
    {
      title: "Invoice visibility",
      desc: "View open, overdue, and paid states in one customer-level timeline.",
    },
    {
      title: "Team handoff",
      desc: "Share account status across finance and operations without fragmented notes.",
    },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
      <main className="flex-1 pt-24">
        <section className="py-16 sm:py-20 border-b border-border/70">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="font-serif text-4xl sm:text-6xl tracking-tight max-w-4xl">Customer management and revenue tracking</h1>
            <p className="text-muted-foreground text-base sm:text-lg mt-5 max-w-3xl">Understand customer contribution and payment dynamics so finance actions are based on clear evidence.</p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            {blocks.map((item) => (
              <article key={item.title} className="border border-border/70 p-5 bg-background">
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
