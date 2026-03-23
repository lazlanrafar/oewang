import { Suspense } from "react";
import type { Metadata } from "next";
import { getContacts } from "@workspace/modules/server";
import { ContactsClient } from "@/components/organisms/contacts/contacts-client";
import { ContactTableSkeleton } from "@/components/organisms/contacts/contact-table-skeleton";

export const metadata: Metadata = {
  title: "Contacts",
};

export default async function ContactsPage() {
  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-6rem)] flex flex-col bg-background no-scrollbar">
      <div className="flex-1 min-h-0 no-scrollbar">
        <Suspense fallback={<ContactTableSkeleton />}>
          <ContactsPageContent />
        </Suspense>
      </div>
    </div>
  );
}

async function ContactsPageContent() {
  const result = await getContacts({ limit: 50 });
  const contacts = result.success ? (result.data ?? []) : [];

  return <ContactsClient initialData={contacts} />;
}
