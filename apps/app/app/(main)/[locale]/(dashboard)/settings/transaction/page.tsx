import React from "react";
import { Separator } from "@workspace/ui";
import { TransactionSettingsForm } from "@/components/organisms/setting/transaction/transaction-settings-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transactions | Settings",
};

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export default async function SettingTransactionPage({ params }: Props) {
  return <TransactionSettingsForm />;
}
