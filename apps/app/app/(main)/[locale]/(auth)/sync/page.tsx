import type { Metadata } from "next";

import { AuthSync } from "@/components/organisms/auth/auth-sync";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Sync Session",
};

export default async function SyncPage(props: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await props.params;

  return (
    <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[450px]">
      <AuthSync locale={locale} />
    </div>
  );
}
