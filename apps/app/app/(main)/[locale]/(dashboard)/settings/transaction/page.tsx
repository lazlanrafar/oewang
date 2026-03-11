import React from "react";

import { Separator } from "@workspace/ui";

import { TransactionSettingsForm } from "@/components/organisms/setting/transaction/transaction-settings-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

interface Props {
  params: Promise<{
    locale: Locale;
  }>;
}

export default async function SettingTransactionPage({ params }: Props) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  const { transaction } = dictionary.settings;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{transaction.title}</h3>
        <p className="text-sm text-muted-foreground">{transaction.description}</p>
      </div>
      <Separator />
      <TransactionSettingsForm dictionary={dictionary} />
    </div>
  );
}
