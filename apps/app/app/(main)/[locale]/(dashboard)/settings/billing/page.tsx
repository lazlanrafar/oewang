import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { BillingView } from "@/components/organisms/setting/billing/billing-view";
import { getActiveWorkspace } from "@workspace/modules/server";
import { unauthorized } from "next/navigation";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale as Locale);

  const workspaceResult = await getActiveWorkspace();
  if (!workspaceResult.success || !workspaceResult.data) {
    unauthorized();
  }

  return (
    <div className="space-y-6">
      <BillingView
        dictionary={dictionary.settings}
        workspace={workspaceResult.data}
      />
    </div>
  );
}
