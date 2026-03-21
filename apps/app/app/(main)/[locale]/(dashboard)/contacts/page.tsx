import { getContacts } from "@workspace/modules/server";
import { ContactsClient } from "@/components/organisms/contacts/contacts-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contacts",
};

export default async function ContactsPage() {
  const result = await getContacts({ limit: 50 });
  const contacts = result.success ? (result.data ?? []) : [];

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-6rem)] flex flex-col bg-background no-scrollbar">
      <div className="flex-1 min-h-0 no-scrollbar">
        <ContactsClient initialData={contacts} />
      </div>
    </div>
  );
}
