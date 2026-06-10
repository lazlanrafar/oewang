import Link from "next/link";

import { Button } from "@workspace/ui/atoms";

import type { WebsiteDictionary } from "@/lib/translations";

export function CTASection({
  isLoggedIn,
  appUrl,
  dictionary,
}: {
  isLoggedIn: boolean;
  appUrl: string;
  locale: string;
  dictionary: WebsiteDictionary;
}) {
  return (
    <section id="start" className="bg-background py-18 sm:py-24">
      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-none border border-border/70 bg-muted/25 px-6 py-10 text-center sm:px-10 sm:py-12">
          <h2 className="mb-4 font-serif text-3xl text-foreground tracking-tight sm:text-4xl">
            {dictionary.cta.title}
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-base text-muted-foreground sm:text-lg">{dictionary.cta.subtitle}</p>

          {isLoggedIn ? (
            <Button size="lg" asChild>
              <Link href={`${appUrl}/`}>{dictionary.hero.ctaGoToDashboard}</Link>
            </Button>
          ) : (
            <Button size="lg" asChild>
              <Link href={`${appUrl}/register`}>{dictionary.cta.getStarted}</Link>
            </Button>
          )}

          <p className="mt-4 text-muted-foreground text-xs">{dictionary.cta.trialNote}</p>
        </div>
      </div>
    </section>
  );
}
