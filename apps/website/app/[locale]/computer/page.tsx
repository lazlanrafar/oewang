import { cookies } from "next/headers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CTASection } from "@/components/sections/cta-section";
import { getDictionary } from "@/lib/translations";

export const metadata = {
  title: "Computer – oewang",
  description: "Autonomous assistant workflows for finance teams.",
};

export default async function ComputerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has(process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-session");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="flex flex-col min-h-screen">
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
      <main className="flex-1 pt-24">
        <section className="py-16 sm:py-20 border-b border-border/70">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="font-serif text-4xl sm:text-6xl tracking-tight max-w-4xl">Autonomous workflows for business finance</h1>
            <p className="text-muted-foreground text-base sm:text-lg mt-5 max-w-3xl">Move from manual task-chasing to proactive operations that run on schedule with clear review states.</p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <article className="border border-border/70 p-6">
              <h2 className="font-serif text-3xl mb-3">Automate monitoring</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">Track expense thresholds, cash trend shifts, and overdue exposure without checking dashboards all day.</p>
            </article>
            <article className="border border-border/70 p-6">
              <h2 className="font-serif text-3xl mb-3">Execute with control</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">Route actions through approvals so autonomous work stays aligned with team governance.</p>
            </article>
          </div>
        </section>

        <CTASection isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
      </main>
      <Footer locale={locale} dictionary={dictionary} />
    </div>
  );
}
