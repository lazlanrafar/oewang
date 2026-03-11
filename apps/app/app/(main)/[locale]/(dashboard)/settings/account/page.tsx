import { Separator } from "@workspace/ui";

import { AccountForm } from "@/components/organisms/setting/account/account-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

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
        <h3 className="text-lg font-medium">{account.title}</h3>
        <p className="text-muted-foreground text-sm">{account.description}</p>
      </div>
      <Separator />
      <AccountForm dictionary={dictionary} />
    </div>
  );
}
