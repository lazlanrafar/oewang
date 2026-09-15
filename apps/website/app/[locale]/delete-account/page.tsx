import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return createPageMetadata({
    locale,
    path: "/delete-account",
    title: "Delete your account",
    description: "Steps to delete your Oewang account and associated data.",
    keywords: ["delete oewang account", "oewang data deletion", "account deletion"],
  });
}

export default async function DeleteAccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
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
          <h1 className="mb-2 font-serif text-2xl tracking-tight">Delete your account</h1>
          <p className="text-muted-foreground text-sm">Last updated: September 15, 2026</p>
        </div>

        <div className="my-8 h-px w-full bg-border" />

        <section className="space-y-4">
          <p className="text-muted-foreground text-sm leading-6">
            You can permanently delete your Oewang account and its associated data directly from the app.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">Steps to delete your account</h2>
          <ol className="list-decimal space-y-2 pl-6 text-muted-foreground text-sm leading-6">
            <li>Open the Oewang app and sign in.</li>
            <li>Go to Settings.</li>
            <li>Tap "Delete Account".</li>
            <li>Confirm the deletion when prompted.</li>
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">What gets deleted</h2>
          <p className="text-muted-foreground text-sm leading-6">
            Deleting your account permanently removes your profile, workspace memberships, transactions, wallets,
            budgets, debts, contacts, uploaded receipts and documents, and AI chat history associated with your
            account. Data shared inside a workspace that other members still depend on (for example a shared
            workspace's own records) is not deleted, only your membership and personal data are removed.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            Some records may be retained for a limited period where required for legal, tax, audit, or fraud-prevention
            obligations, consistent with our{" "}
            <Link href={locale === "en" ? "/policy" : `/${locale}/policy`} className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section className="mb-20 space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">Need help?</h2>
          <p className="text-muted-foreground text-sm leading-6">
            If you can't access the app to delete your account yourself, contact us at{" "}
            <a className="underline transition-colors hover:text-foreground" href="mailto:support@oewang.com">
              support@oewang.com
            </a>{" "}
            and we'll process your deletion request.
          </p>
        </section>
      </div>
    </div>
  );
}
