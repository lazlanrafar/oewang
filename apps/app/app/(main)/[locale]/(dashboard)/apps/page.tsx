import type { Metadata } from "next";

import { AppsClient } from "@/components/organisms/apps/apps-client";
import { Hydrated } from "@/components/shared/hydrated";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Apps",
};

export default async function AppsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const dictionary = await getDictionary((await params).locale);
  return (
    <div className="flex-1">
      <Hydrated>
        <AppsClient dictionary={dictionary} />
      </Hydrated>
    </div>
  );
}
