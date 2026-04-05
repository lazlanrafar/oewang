import { cookies } from "next/headers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CTASection } from "@/components/sections/cta-section";
import { getDictionary } from "@/lib/translations";
import { MessageCircle, Check, QrCode } from "lucide-react";

export default async function IntegrationsPage({
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

  return (
    <div className="flex flex-col min-h-screen">
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} />

      <main className="flex-1 pt-24">
        {/* Header */}
        <section className="py-16 sm:py-24">
          <div className="max-w-[800px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="font-serif text-3xl sm:text-5xl tracking-tight text-foreground mb-6">
              {dictionary.integrations.title}
            </h1>
            <p className="text-muted-foreground text-lg sm:text-xl max-w-2xl mx-auto">
              {dictionary.integrations.subtitle}
            </p>
          </div>
        </section>

        {/* Telegram Integration */}
        <section className="py-16 bg-muted/30">
          <div className="max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Left - Info */}
              <div>
                <div className="size-16 rounded-lg bg-[#229ED9] flex items-center justify-center mb-6">
                  <MessageCircle className="size-8 text-white" />
                </div>
                <h2 className="font-serif text-2xl sm:text-3xl text-foreground mb-4">
                  {dictionary.integrations.telegram.title}
                </h2>
                <p className="text-muted-foreground mb-8">
                  {dictionary.integrations.telegram.description}
                </p>

                {/* Setup Steps */}
                <h3 className="font-medium text-foreground mb-4">
                  {dictionary.integrations.telegram.setupTitle}
                </h3>
                <ol className="space-y-3">
                  {dictionary.integrations.telegram.setupSteps.map(
                    (step, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="size-6 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">
                          {index + 1}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {step}
                        </span>
                      </li>
                    ),
                  )}
                </ol>
              </div>

              {/* Right - QR Code Placeholder */}
              <div className="flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-dashed border-border flex flex-col items-center justify-center rounded-lg">
                  <QrCode className="size-16 text-muted-foreground/30 mb-4" />
                  <p className="text-sm text-muted-foreground/50 text-center px-8">
                    QR Code will appear here after connecting
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Coming Soon */}
        <section className="py-16">
          <div className="max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                <span className="size-1.5 rounded-full bg-yellow-500" />
                {dictionary.integrations.comingSoon}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                "Gmail",
                "Outlook",
                "QuickBooks",
                "Xero",
                "Xendit",
                "Google Drive",
              ].map((name) => (
                <div
                  key={name}
                  className="p-4 border border-border text-center"
                >
                  <div className="size-10 rounded bg-muted mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <CTASection isLoggedIn={isLoggedIn} appUrl={appUrl} />
      </main>

      <Footer />
    </div>
  );
}
