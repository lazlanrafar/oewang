import React from "react";
import { AppearanceForm } from "@/components/organisms/setting/appearance/appearance-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Appearance | Settings",
};

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export default async function SettingAppearancePage({ params }: Props) {
  return <AppearanceForm />;
}
