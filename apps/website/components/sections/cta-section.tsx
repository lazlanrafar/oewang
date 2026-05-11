import { Button } from "@workspace/ui/atoms";
import Link from "next/link";
import type { WebsiteDictionary } from "@/lib/translations";

export function CTASection({
  isLoggedIn,
  appUrl,
  locale,
  dictionary,
}: {
  isLoggedIn: boolean;
  appUrl: string;
  locale: string;
  dictionary: WebsiteDictionary;
}) {
  const withLocale = (path: string) => `/${locale}${path === "/" ? "" : path}`;

  return (
    <section className="py-18 sm:py-24 bg-background">
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto rounded-none border border-border/70 bg-muted/25 px-6 sm:px-10 py-10 sm:py-12 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-foreground mb-4">
            {dictionary.cta.title}
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg mb-8 max-w-2xl mx-auto">
            {dictionary.cta.subtitle}
          </p>

          {isLoggedIn ? (
            <Button size="lg" asChild>
              <Link href={`${appUrl}/`}>{dictionary.hero.ctaGoToDashboard}</Link>
            </Button>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild>
                <Link href={`${appUrl}/register`}>{dictionary.cta.getStarted}</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href={withLocale("/pricing")}>{dictionary.cta.viewPricing}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
