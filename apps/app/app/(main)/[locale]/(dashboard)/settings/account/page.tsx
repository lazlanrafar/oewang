import { Separator } from "@workspace/ui";
import type { Metadata } from "next";

import { AccountForm } from "@/components/organisms/setting/account/account-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Account | Settings",
};

interface Props {
  params: Promise<{
    locale: Locale;
  }>;
}

export default async function SettingsAccountPage({ params }: Props) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  const { account } = dictionary.settings;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium text-lg">{account.title}</h3>
        <p className="text-muted-foreground text-sm">{account.description}</p>
      </div>
      <Separator />
      <AccountForm dictionary={dictionary} />
    </div>
  );
}
