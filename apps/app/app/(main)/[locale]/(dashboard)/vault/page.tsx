import type { Metadata } from "next";

import { VaultClient } from "@/components/organisms/vault/vault-client";
import { VaultSkeletonLoading } from "@/components/organisms/vault/vault-skeleton-loading";
import { Hydrated } from "@/components/shared/hydrated";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Vault",
};

export default async function VaultPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Hydrated fallback={<VaultSkeletonLoading />}>
        <VaultClient dictionary={dictionary} />
      </Hydrated>
    </div>
  );
}
