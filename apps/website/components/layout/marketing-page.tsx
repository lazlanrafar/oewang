import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
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
    <div className="flex flex-col min-h-screen">
      <Header
        isLoggedIn={isLoggedIn}
        appUrl={appUrl}
        locale={locale}
        dictionary={dictionary}
      />

      <main className="flex-1 pt-24">
        <section className="py-16 sm:py-20 border-b border-border/70">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="font-serif text-4xl sm:text-6xl tracking-tight max-w-4xl">
              {title}
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg mt-5 max-w-3xl">
              {subtitle}
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.map((section) => (
              <article key={section.title} className="border border-border/70 bg-background p-5">
                <h2 className="font-serif text-2xl tracking-tight mb-3">{section.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {section.description}
                </p>
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
