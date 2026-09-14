import type { Metadata } from "next";

import { AuthSync } from "@/components/organisms/auth/auth-sync";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Sync Session",
};

// Only ever set by our own OAuth callback redirects (see api/auth/*/callback) —
// allowlisted rather than passed through raw so a tampered query string can't
// turn this into an open redirect.
const ALLOWED_RETURN_TO = new Set(["/overview", "/create-workspace"]);

export default async function SyncPage(props: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { locale } = await props.params;
  const { returnTo } = await props.searchParams;
  const target = returnTo && ALLOWED_RETURN_TO.has(returnTo) ? returnTo : "/overview";

  return (
    <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[450px]">
      <AuthSync locale={locale} returnTo={target} />
    </div>
  );
}
