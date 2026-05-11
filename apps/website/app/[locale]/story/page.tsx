import { cookies } from "next/headers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CTASection } from "@/components/sections/cta-section";
import { getDictionary } from "@/lib/translations";

export default async function StoryPage({
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
        <section className="py-16 sm:py-24">
          <div className="max-w-[840px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <span className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                {dictionary.story.title}
              </span>
              <h1 className="font-serif text-3xl sm:text-5xl tracking-tight text-foreground mt-4 mb-6">
                {dictionary.story.heading}
              </h1>
            </div>

            <div className="space-y-10">
              <article>
                <h2 className="font-serif text-2xl mb-3">{dictionary.story.problemTitle}</h2>
                <p className="text-muted-foreground leading-relaxed">{dictionary.story.problemText}</p>
              </article>

              <article>
                <h2 className="font-serif text-2xl mb-3">{dictionary.story.solutionTitle}</h2>
                <p className="text-muted-foreground leading-relaxed">{dictionary.story.solutionText}</p>
              </article>

              <article>
                <h2 className="font-serif text-2xl mb-3">{dictionary.story.modernTitle}</h2>
                <p className="text-muted-foreground leading-relaxed">{dictionary.story.modernText}</p>
              </article>

              <article>
                <h2 className="font-serif text-2xl mb-3">{dictionary.story.focusTitle}</h2>
                <ul className="space-y-2.5">
                  {dictionary.story.focusItems.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <span className="mt-1.5 size-1.5 rounded-full bg-foreground shrink-0" />
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            <div className="border-t border-border pt-10 mt-14 text-center">
              <p className="font-serif text-lg text-foreground">— {dictionary.story.founder}</p>
              <p className="text-sm text-muted-foreground mt-1">{dictionary.story.founderTitle}</p>
            </div>
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
