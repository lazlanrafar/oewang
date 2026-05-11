import { redirect } from "next/navigation";

export default async function LegacyUpgradeSuccessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/payment/success`);
}
