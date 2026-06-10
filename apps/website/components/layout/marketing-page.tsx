import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { CTASection } from "@/components/sections/cta-section";
import type { WebsiteDictionary } from "@/lib/translations";

export function MarketingPage({
  title,
  subtitle,
  locale,
  isLoggedIn,
  appUrl,
  dictionary,
  sections,
}: {
  title: string;
  subtitle: string;
  locale: string;
  isLoggedIn: boolean;
  appUrl: string;
  dictionary: WebsiteDictionary;
  sections: Array<{
    title: string;
    description: string;
    points?: string[];
  }>;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />

      <main className="flex-1 pt-24">
        <section className="border-border/70 border-b py-16 sm:py-20">
          <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-8">
            <h1 className="max-w-4xl font-serif text-4xl tracking-tight sm:text-6xl">{title}</h1>
            <p className="mt-5 max-w-3xl text-base text-muted-foreground sm:text-lg">{subtitle}</p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-4 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
            {sections.map((section) => (
              <article key={section.title} className="border border-border/70 bg-background p-5">
                <h2 className="mb-3 font-serif text-2xl tracking-tight">{section.title}</h2>
                <p className="mb-4 text-muted-foreground text-sm leading-relaxed">{section.description}</p>
                {section.points && section.points.length > 0 && (
                  <div className="space-y-2">
                    {section.points.map((point) => (
                      <div key={point} className="flex items-start gap-2.5">
                        <span className="mt-1.5 size-1.5 bg-foreground" />
                        <span className="text-sm">{point}</span>
                      </div>
                    ))}
                  </div>
                )}
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
