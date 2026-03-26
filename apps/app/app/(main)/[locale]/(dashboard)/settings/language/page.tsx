import React from "react";
import { LanguageSettingsForm } from "@/components/organisms/setting/language/language-settings-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Language | Settings",
};

export default async function SettingLanguagePage() {
  return (
    <div className="space-y-6">
      <LanguageSettingsForm />
    </div>
  );
}
