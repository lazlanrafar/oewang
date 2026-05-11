import Link from "next/link";
import { cookies } from "next/headers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CTASection } from "@/components/sections/cta-section";
import { getDictionary } from "@/lib/translations";

export const metadata = {
  title: "Updates – oewang",
  description: "Latest product updates from Oewang.",
};

const POSTS = [
  {
    title: "Weekly insights",
    description: "New weekly summary flow for cash position, overdue invoices, and action recommendations.",
    date: "April 2026",
  },
  {
    title: "Integrations directory",
    description: "New integrations index and detail pages for faster setup decisions.",
    date: "April 2026",
  },
  {
    title: "Workspace collaboration",
    description: "Improved role-based access and shared review flows for growing teams.",
    date: "March 2026",
  },
];

export default async function UpdatesPage({
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
      <Header isLoggedIn={isLoggedIn} appUrl={appUrl} locale={locale} dictionary={dictionary} />
      <main className="flex-1 pt-24">
        <section className="py-16 sm:py-20 border-b border-border/70">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="font-serif text-4xl sm:text-6xl tracking-tight">Updates</h1>
            <p className="text-muted-foreground text-base sm:text-lg mt-5 max-w-3xl">
              Product and platform updates for Oewang.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
            {POSTS.map((post) => (
              <article key={post.title} className="border border-border/70 p-5 hover:bg-muted/20 transition-colors">
                <p className="text-xs text-muted-foreground mb-2">{post.date}</p>
                <h2 className="font-serif text-2xl mb-2">{post.title}</h2>
                <p className="text-sm text-muted-foreground">{post.description}</p>
                <Link href={`/${locale}/support`} className="mt-4 inline-block text-xs text-muted-foreground hover:text-foreground">
                  Learn more
                </Link>
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
