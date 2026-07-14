import { cookies } from "next/headers";
import Link from "next/link";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Container, SectionLabel } from "@/components/sections/_shared";
import { getPublicArticles } from "@/lib/articles.server";
import { createPageMetadata } from "@/lib/seo";
import { getDictionary } from "@/lib/translations";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return createPageMetadata({
    locale,
    path: "/articles",
    title: "Articles — Oewang",
    description: "Guides and updates on tracking money, receipts, and AI-powered finance from the Oewang team.",
    keywords: ["Oewang blog", "finance articles", "money management guides"],
  });
}

export default async function ArticlesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);
  const prefix = locale === "en" ? "" : `/${locale}`;

  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has(process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-session");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const articles = await getPublicArticles();

  return (
    <div className="flex min-h-screen flex-col">
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />

      <main className="flex-1 pt-32 pb-24">
        <Container>
          <SectionLabel>Articles</SectionLabel>
          <h1 className="mt-5 max-w-2xl font-serif text-4xl text-foreground leading-tight tracking-tight sm:text-5xl">
            From the Oewang team.
          </h1>

          {articles.length === 0 ? (
            <p className="mt-12 text-muted-foreground">No articles yet. Check back soon.</p>
          ) : (
            <div className="mt-14 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((a) => (
                <Link key={a.id} href={`${prefix}/articles/${a.slug}`} className="group flex flex-col">
                  {a.cover_image ? (
                    // biome-ignore lint/performance/noImgElement: remote cover URLs, marketing page
                    <img src={a.cover_image} alt={a.title} className="mb-5 aspect-[16/10] w-full object-cover" />
                  ) : (
                    <div className="mb-5 aspect-[16/10] w-full bg-[hsl(var(--brand-accent)/0.08)]" />
                  )}
                  <h2 className="font-serif text-foreground text-xl leading-snug tracking-tight transition-colors group-hover:text-[hsl(var(--brand-accent))]">
                    {a.title}
                  </h2>
                  {a.excerpt ? (
                    <p className="mt-2 line-clamp-3 text-muted-foreground text-sm leading-relaxed">{a.excerpt}</p>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </Container>
      </main>

      <Footer locale={locale} dictionary={dictionary} />
    </div>
  );
}
