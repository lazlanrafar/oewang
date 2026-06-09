import type { LucideIcon } from "lucide-react";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { CTASection } from "@/components/sections/cta-section";
import type { WebsiteDictionary } from "@/lib/translations";

type Metric = {
  value: string;
  label: string;
};

type MarketingCard = {
  title: string;
  description: string;
  icon?: LucideIcon;
};

type WorkflowStep = {
  title: string;
  description: string;
};

type DetailSection = {
  title: string;
  description: string;
  points: string[];
};

type FaqItem = {
  question: string;
  answer: string;
};

type ProductMarketingPageProps = {
  locale: string;
  isLoggedIn: boolean;
  appUrl: string;
  dictionary: WebsiteDictionary;
  eyebrow: string;
  title: string;
  subtitle: string;
  metrics: Metric[];
  cards: MarketingCard[];
  workflowTitle: string;
  workflowSubtitle: string;
  workflow: WorkflowStep[];
  proofTitle: string;
  proofPoints: string[];
  detailSections?: DetailSection[];
  faqItems?: FaqItem[];
  jsonLd?: Record<string, unknown>;
};

export function ProductMarketingPage({
  locale,
  isLoggedIn,
  appUrl,
  dictionary,
  eyebrow,
  title,
  subtitle,
  metrics,
  cards,
  workflowTitle,
  workflowSubtitle,
  workflow,
  proofTitle,
  proofPoints,
  detailSections = [],
  faqItems = [],
  jsonLd,
}: ProductMarketingPageProps) {
  return (
    <div className="flex min-h-screen flex-col">
      {jsonLd ? (
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data must be serialized into the document head/body.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}

      <Header appUrl={appUrl} dictionary={dictionary} isLoggedIn={isLoggedIn} locale={locale} />

      <main className="flex-1 pt-24">
        <section className="border-border/70 border-b py-16 sm:py-24">
          <div className="mx-auto grid max-w-[1200px] gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
            <div>
              <p className="mb-4 text-muted-foreground text-xs uppercase tracking-[0.24em]">{eyebrow}</p>
              <h1 className="max-w-4xl font-serif text-4xl tracking-tight sm:text-6xl">{title}</h1>
              <p className="mt-6 max-w-3xl text-base text-muted-foreground leading-relaxed sm:text-lg">{subtitle}</p>
            </div>

            <div className="grid grid-cols-2 border border-border/70 bg-muted/20">
              {metrics.map((metric) => (
                <div
                  className="border-border/70 border-b p-5 last:border-b-0 even:border-l sm:p-6 [&:nth-last-child(2)]:border-b-0"
                  key={metric.label}
                >
                  <p className="font-serif text-3xl tracking-tight">{metric.value}</p>
                  <p className="mt-2 text-muted-foreground text-xs leading-relaxed">{metric.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-14 sm:py-20">
          <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
            {cards.map((card) => {
              const Icon = card.icon;

              return (
                <article className="border border-border/70 bg-background p-5" key={card.title}>
                  {Icon ? (
                    <div className="mb-5 flex size-10 items-center justify-center border border-border/70">
                      <Icon className="size-5 text-muted-foreground" />
                    </div>
                  ) : null}
                  <h2 className="mb-3 font-serif text-2xl tracking-tight">{card.title}</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">{card.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-border/70 border-y bg-muted/20 py-14 sm:py-20">
          <div className="mx-auto grid max-w-[1200px] gap-10 px-4 sm:px-6 lg:grid-cols-[360px_1fr] lg:px-8">
            <div>
              <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">{workflowTitle}</h2>
              <p className="mt-4 text-muted-foreground text-sm leading-relaxed">{workflowSubtitle}</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {workflow.map((step, index) => (
                <article className="border border-border/70 bg-background p-5" key={step.title}>
                  <p className="mb-3 text-muted-foreground text-xs tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mb-2 font-serif text-2xl">{step.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-14 sm:py-20">
          <div className="mx-auto max-w-[900px] px-4 sm:px-6 lg:px-8">
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">{proofTitle}</h2>
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {proofPoints.map((point) => (
                <div className="flex items-start gap-3 border border-border/70 p-4" key={point}>
                  <span className="mt-2 size-1.5 shrink-0 bg-foreground" />
                  <p className="text-sm leading-relaxed">{point}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {detailSections.length > 0 ? (
          <section className="border-border/70 border-t py-14 sm:py-20">
            <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {detailSections.map((section) => (
                  <article className="border border-border/70 bg-background p-6" key={section.title}>
                    <h2 className="mb-3 font-serif text-2xl tracking-tight">{section.title}</h2>
                    <p className="mb-5 text-muted-foreground text-sm leading-relaxed">{section.description}</p>
                    <div className="space-y-3">
                      {section.points.map((point) => (
                        <div className="flex items-start gap-3" key={point}>
                          <span className="mt-2 size-1.5 shrink-0 bg-foreground" />
                          <p className="text-sm leading-relaxed">{point}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {faqItems.length > 0 ? (
          <section className="border-border/70 border-t bg-muted/15 py-14 sm:py-20">
            <div className="mx-auto grid max-w-[1100px] gap-8 px-4 sm:px-6 lg:grid-cols-[320px_1fr] lg:px-8">
              <div>
                <p className="mb-3 text-muted-foreground text-xs uppercase tracking-[0.22em]">Common questions</p>
                <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">Details before you start</h2>
              </div>
              <div className="space-y-3">
                {faqItems.map((item) => (
                  <details className="group border border-border/70 bg-background" key={item.question}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 text-sm transition-colors hover:bg-muted/25">
                      <span className="font-medium">{item.question}</span>
                      <span className="text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
                    </summary>
                    <p className="px-4 pb-4 text-muted-foreground text-sm leading-relaxed">{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <CTASection appUrl={appUrl} dictionary={dictionary} isLoggedIn={isLoggedIn} locale={locale} />
      </main>

      <Footer dictionary={dictionary} locale={locale} />
    </div>
  );
}
