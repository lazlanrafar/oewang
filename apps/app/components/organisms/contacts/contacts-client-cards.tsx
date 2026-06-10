"use client";

import type { Dictionary } from "@workspace/dictionaries";
import { DataTablePageCard } from "@workspace/ui";

interface ContactsClientCardsProps {
  total: number;
  addedThisMonth: number;
  withEmail: number;
  withPhone: number;
  isLoading: boolean;
  dictionary: Dictionary;
}

export function ContactsClientCards({
  total,
  addedThisMonth,
  withEmail,
  withPhone,
  isLoading,
  dictionary,
}: ContactsClientCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <DataTablePageCard
        label={dictionary.contacts.summary.total}
        value={total}
        isLoading={isLoading}
      />
      <DataTablePageCard
        label={dictionary.contacts.summary.added_this_month}
        value={addedThisMonth}
        isLoading={isLoading}
        valueClassName={addedThisMonth > 0 ? "text-emerald-600 dark:text-emerald-400" : undefined}
      />
      <DataTablePageCard
        label={dictionary.contacts.summary.with_email}
        value={withEmail}
        isLoading={isLoading}
      />
      <DataTablePageCard
        label={dictionary.contacts.summary.with_phone}
        value={withPhone}
        isLoading={isLoading}
      />
    </div>
  );
}
