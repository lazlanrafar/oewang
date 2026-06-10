import Link from "next/link";

import { Button } from "@workspace/ui/atoms";

import type { WebsiteDictionary } from "@/lib/translations";

export function HeroSection({
  isLoggedIn,
  appUrl,
  dictionary,
}: {
  isLoggedIn: boolean;
  appUrl: string;
  dictionary: WebsiteDictionary;
}) {
  return (
    <section id="overview" className="relative overflow-hidden pt-36 pb-16 sm:pt-40 sm:pb-24">
      <div
        className="-z-10 pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 500px at 80% -10%, hsl(var(--foreground)/0.12), transparent 60%), radial-gradient(900px 500px at 10% 0%, hsl(var(--muted-foreground)/0.12), transparent 65%)",
        }}
      />

      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="mb-6 inline-flex items-center rounded-none border border-border/80 bg-background px-3 py-1 text-muted-foreground text-xs">
              <span className="mr-2 inline-block size-1.5 rounded-none bg-green-500" />
              {dictionary.hero.badge}
            </div>

            <h1 className="font-serif text-4xl text-foreground leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              {dictionary.hero.title}
            </h1>

            <p className="mt-5 max-w-xl text-base text-muted-foreground leading-relaxed sm:text-lg">
              {dictionary.hero.subtitle}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {isLoggedIn ? (
                <Button size="lg" asChild>
                  <Link href={`${appUrl}/`}>{dictionary.hero.ctaGoToDashboard}</Link>
                </Button>
              ) : (
                <>
                  <Button size="lg" asChild>
                    <Link href={`${appUrl}/register`}>{dictionary.hero.ctaStartFree}</Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <a href="#capture">{dictionary.hero.ctaSeeHow}</a>
                  </Button>
                </>
              )}
            </div>

            <p className="mt-4 text-muted-foreground text-xs">{dictionary.hero.trialNote}</p>
          </div>

          <div className="relative">
            <div className="rounded-none border border-border/70 bg-background/90 p-5 backdrop-blur-sm sm:p-6">
              <div className="flex items-center justify-between border-border/70 border-b pb-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">Workspace Snapshot</p>
                <p className="text-green-600 text-xs">Live sync</p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-none border border-border bg-muted/30 p-4">
                  <p className="text-muted-foreground text-xs">Transactions</p>
                  <p className="mt-1 font-serif text-2xl">1,284</p>
                  <p className="mt-1 text-green-600 text-xs">+12% this month</p>
                </div>
                <div className="rounded-none border border-border bg-muted/30 p-4">
                  <p className="text-muted-foreground text-xs">Uncategorized</p>
                  <p className="mt-1 font-serif text-2xl">18</p>
                  <p className="mt-1 text-muted-foreground text-xs">Auto-rules active</p>
                </div>
                <div className="col-span-2 rounded-none border border-border bg-muted/30 p-4">
                  <p className="text-muted-foreground text-xs">Teams and personal workspaces in one account</p>
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
