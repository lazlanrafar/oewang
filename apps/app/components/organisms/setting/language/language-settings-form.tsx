"use client";

import { usePathname, useRouter } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui";

import type { Locale } from "@/i18n-config";

interface LanguageSettingsFormProps {
  currentLocale: Locale;
  dictionary: {
    settings: {
      language: {
        title: string;
        description: string;
        options: {
          en: string;
          ja: string;
          id: string;
        };
      };
    };
  };
}

export function LanguageSettingsForm({ currentLocale, dictionary }: LanguageSettingsFormProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLanguageChange = (newLocale: string) => {
    // Replace the locale segment in the pathname
    const segments = pathname.split("/");
    // segments[0] is empty string because path starts with /
    // segments[1] is the locale
    segments[1] = newLocale;
    const newPath = segments.join("/");

    router.push(newPath);
  };

  const { title, description, options } = dictionary.settings.language;

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-base font-medium">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <Select value={currentLocale} onValueChange={handleLanguageChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select language" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
