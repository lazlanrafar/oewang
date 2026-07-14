import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft } from "lucide-react";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Container } from "@/components/sections/_shared";
import { getPublicArticleBySlug, getPublicArticles } from "@/lib/articles.server";
import { createPageMetadata } from "@/lib/seo";
import { getDictionary } from "@/lib/translations";

// Pre-render published article slugs; new ones fall back to on-demand ISR.
export async function generateStaticParams() {
  const articles = await getPublicArticles();
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const article = await getPublicArticleBySlug(slug);
  if (!article) {
    return createPageMetadata({
      locale,
      path: `/articles/${slug}`,
      title: "Article not found — Oewang",
      description: "This article could not be found.",
    });
  }
  return createPageMetadata({
    locale,
    path: `/articles/${slug}`,
    title: `${article.title} — Oewang`,
    description: article.excerpt ?? article.title,
    keywords: ["Oewang blog", article.title],
  });
}

export default async function ArticleDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const article = await getPublicArticleBySlug(slug);
  if (!article) notFound();

  const dictionary = getDictionary(locale);
  const prefix = locale === "en" ? "" : `/${locale}`;

  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has(process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-session");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="flex min-h-screen flex-col">
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />

      <main className="flex-1 pt-32 pb-24">
        <Container className="max-w-3xl!">
          <Link
            href={`${prefix}/articles`}
            className="mb-8 inline-flex items-center text-muted-foreground text-sm transition-colors hover:text-foreground"
          >
            <ArrowLeft className="mr-2 size-4" />
            {dictionary.articles.all}
          </Link>

          <h1 className="font-serif text-4xl text-foreground leading-tight tracking-tight sm:text-5xl">
            {article.title}
          </h1>
          {article.published_at ? (
            <p className="mt-4 text-muted-foreground text-sm">
              {new Date(article.published_at).toLocaleDateString(
                locale === "ja" ? "ja-JP" : locale === "id" ? "id-ID" : "en-US",
                { year: "numeric", month: "long", day: "numeric" },
              )}
            </p>
          ) : null}

          {article.cover_image ? (
            // biome-ignore lint/performance/noImgElement: remote cover URL, marketing page
            <img src={article.cover_image} alt={article.title} className="mt-8 aspect-[16/9] w-full object-cover" />
          ) : null}

          {/* ponytail: article body is authored only by admins via the constrained
              Tiptap editor (no <script>/<iframe> tags), so it's rendered directly.
              Upgrade path: run through isomorphic-dompurify if non-admin authorship
              is ever allowed. */}
          <article
            className="prose-article mt-10 text-foreground leading-relaxed"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: admin-authored Tiptap HTML
            dangerouslySetInnerHTML={{ __html: article.content ?? "" }}
          />
        </Container>
      </main>

      <Footer locale={locale} dictionary={dictionary} />
    </div>
  );
}
