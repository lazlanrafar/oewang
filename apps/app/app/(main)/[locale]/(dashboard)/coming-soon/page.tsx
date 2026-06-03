import type { Metadata } from "next";

import { ComingSoonClient } from "@/components/organisms/shared/coming-soon-client";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Coming Soon",
  description: "This feature is currently under development. Stay tuned for updates!",
};

export default async function ComingSoonPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  return <ComingSoonClient dictionary={dictionary} />;
}
