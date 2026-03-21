import React from "react";

import { AppearanceForm } from "@/components/organisms/setting/appearance/appearance-form";

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export default async function SettingAppearancePage({ params }: Props) {
  return <AppearanceForm />;
}
