import { cookies } from "next/headers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CTASection } from "@/components/sections/cta-section";
import { getDictionary } from "@/lib/translations";

export const metadata = {
  title: "Chat – oewang",
  description: "Run finance actions from chat tools like Slack, Telegram, and WhatsApp.",
};

export default async function ChatPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has(process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-session");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const channels = [
    { title: "Slack", desc: "Handle finance actions inside your team communication flow." },
    { title: "Telegram", desc: "Capture receipts and get updates while on the go." },
    { title: "WhatsApp", desc: "Use familiar chat flow for fast receipt and task handling." },
    { title: "AI Assistant", desc: "Ask plain-language finance questions and get direct answers." },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
      <main className="flex-1 pt-24">
        <section className="py-16 sm:py-20 border-b border-border/70">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="font-serif text-4xl sm:text-6xl tracking-tight max-w-4xl">Run business finance from chat</h1>
            <p className="text-muted-foreground text-base sm:text-lg mt-5 max-w-3xl">Turn everyday chat tools into finance execution surfaces for tracking, receipts, and shared team actions.</p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            {channels.map((item) => (
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
