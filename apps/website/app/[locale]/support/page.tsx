import { cookies } from "next/headers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CTASection } from "@/components/sections/cta-section";
import { getDictionary } from "@/lib/translations";
import { Mail } from "lucide-react";

const FAQ_ITEMS = [
  {
    question: "Can I use Oewang as an individual and as a team?",
    answer:
      "Yes. You can keep personal tracking private and also run shared workspace finance with your team.",
  },
  {
    question: "How does multi-user workspace access work?",
    answer:
      "You can invite members and set role-based permissions so each person sees the right data and actions.",
  },
  {
    question: "Can Oewang track recurring transactions and bills?",
    answer:
      "Yes. Oewang helps track recurring flows so you can see upcoming commitments and avoid surprises.",
  },
  {
    question: "Does Oewang support multiple currencies?",
    answer:
      "Yes. You can monitor cash flow across currencies while keeping your reports and categories organized.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Yes. We use encryption and workspace-scoped access controls so data is isolated and protected.",
  },
];

export default async function SupportPage({
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
      <Header
        isLoggedIn={isLoggedIn}
        appUrl={appUrl}
        locale={locale}
        dictionary={dictionary}
      />

      <main className="flex-1 pt-24">
        <section className="py-16 sm:py-20">
          <div className="max-w-[840px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="font-serif text-3xl sm:text-5xl tracking-tight text-foreground mb-5">
              {dictionary.support.title}
            </h1>
            <p className="text-muted-foreground text-lg">{dictionary.support.subtitle}</p>
          </div>
        </section>

        <section className="py-14 bg-muted/25 border-y border-border/70">
          <div className="max-w-[840px] mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="font-serif text-2xl mb-2">{dictionary.support.faqTitle}</h2>
            <p className="text-muted-foreground mb-8">{dictionary.support.faqSubtitle}</p>

            <div className="space-y-3">
              {FAQ_ITEMS.map((item) => (
                <details key={item.question} className="group border border-border rounded-none bg-background">
                  <summary className="flex items-center justify-between cursor-pointer p-4 hover:bg-muted/40 transition-colors list-none">
                    <span className="text-sm font-medium text-foreground pr-5">{item.question}</span>
                    <span className="text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="px-4 pb-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="py-14">
          <div className="max-w-[620px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-serif text-2xl text-foreground mb-3">{dictionary.support.contactTitle}</h2>
            <p className="text-muted-foreground mb-6">{dictionary.support.contactText}</p>
            <a
              href="mailto:support@oewang.com"
              className="inline-flex items-center gap-2 border border-border px-4 py-2 rounded-none text-sm hover:bg-muted/30 transition-colors"
            >
              <Mail className="size-4" />
              support@oewang.com
            </a>
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
