import { Button } from "@workspace/ui/atoms";
import Link from "next/link";
import type { WebsiteDictionary } from "@/lib/translations";

export function HeroSection({
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
    <section className="relative overflow-hidden pt-36 pb-16 sm:pt-40 sm:pb-24">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1200px 500px at 80% -10%, hsl(var(--foreground)/0.12), transparent 60%), radial-gradient(900px 500px at 10% 0%, hsl(var(--muted-foreground)/0.12), transparent 65%)",
        }}
      />

      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center rounded-none border border-border/80 bg-background px-3 py-1 text-xs text-muted-foreground mb-6">
              <span className="mr-2 inline-block size-1.5 rounded-none bg-green-500" />
              {dictionary.hero.badge}
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl tracking-tight text-foreground leading-[1.05]">
              {dictionary.hero.title}
            </h1>

            <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              {dictionary.hero.subtitle}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {isLoggedIn ? (
                <Button size="lg" asChild>
                  <Link href={`${appUrl}/`}>
                    {dictionary.hero.ctaGoToDashboard}
                  </Link>
                </Button>
              ) : (
                <>
                  <Button size="lg" asChild>
                    <Link href={`${appUrl}/register`}>
                      {dictionary.hero.ctaStartFree}
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link href={withLocale("/features")}>
                      {dictionary.hero.ctaSeeHow}
                    </Link>
                  </Button>
                </>
              )}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              {dictionary.hero.trialNote}
            </p>
          </div>

          <div className="relative">
            <div className="rounded-none border border-border/70 bg-background/90 p-5 sm:p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-border/70 pb-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Workspace Snapshot
                </p>
                <p className="text-xs text-green-600">Live sync</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="rounded-none border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">Transactions</p>
                  <p className="font-serif text-2xl mt-1">1,284</p>
                  <p className="text-xs text-green-600 mt-1">+12% this month</p>
                </div>
                <div className="rounded-none border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">Uncategorized</p>
                  <p className="font-serif text-2xl mt-1">18</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Auto-rules active
                  </p>
                </div>
                <div className="rounded-none border border-border bg-muted/30 p-4 col-span-2">
                  <p className="text-xs text-muted-foreground">
                    Teams and personal workspaces in one account
                  </p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span>Personal</span>
                    <span className="text-muted-foreground">Synced</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span>Studio Workspace</span>
                    <span className="text-muted-foreground">4 members</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
