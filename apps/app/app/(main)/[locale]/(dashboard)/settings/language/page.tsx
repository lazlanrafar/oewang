import React from "react";
import { LanguageSettingsForm } from "@/components/organisms/setting/language/language-settings-form";

export default async function SettingLanguagePage() {
  return (
    <div className="space-y-6">
      <LanguageSettingsForm />
    </div>
  );
}
