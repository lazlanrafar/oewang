import { getContacts } from "@workspace/modules/server";
import type { Metadata } from "next";

import { ContactsClient } from "@/components/organisms/contacts/contacts-client";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Contacts",
};

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;

  const [result, dictionary] = await Promise.all([
    getContacts({ limit: 50 }),
    getDictionary(locale),
  ]);

  const contacts = result.success ? (result.data ?? []) : [];

  return (
    <div className="no-scrollbar flex h-[calc(100dvh-5rem)] flex-col bg-background md:h-[calc(100dvh-6rem)]">
      <div className="no-scrollbar min-h-0 flex-1">
        <ContactsClient initialData={contacts} dictionary={dictionary} />
      </div>
    </div>
  );
}
