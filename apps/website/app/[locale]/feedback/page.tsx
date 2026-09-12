import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { FeedbackForm } from "@/components/sections/feedback-form";
import { createPageMetadata } from "@/lib/seo";
import { getDictionary } from "@/lib/translations";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);

  return createPageMetadata({
    locale,
    path: "/feedback",
    title: dictionary.feedback.metaTitle,
    description: dictionary.feedback.metaDescription,
  });
}

export default async function FeedbackPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <Link
        href={locale === "en" ? "/" : `/${locale}`}
        className="mb-8 inline-flex items-center text-muted-foreground text-sm transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-2 size-4" />
        Back to home
      </Link>

      <div className="space-y-6">
        <div>
          <h1 className="mb-2 font-serif text-2xl tracking-tight">{dictionary.feedback.heading}</h1>
          <p className="text-muted-foreground text-sm">{dictionary.feedback.subheading}</p>
        </div>

        <div className="my-8 h-px w-full bg-border" />

        <FeedbackForm dictionary={dictionary} />
      </div>
    </div>
  );
}
