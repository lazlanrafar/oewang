"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
} from "@workspace/ui";
import type { Locale } from "@/i18n-config";
import { useAppStore } from "@/stores/app";

function LanguageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Skeleton className="h-6 w-48 rounded-none" />
        <Skeleton className="h-4 w-72 rounded-none" />
      </div>
      <Separator className="rounded-none" />
      <Skeleton className="h-8 w-[180px] rounded-none" />
    </div>
  );
}

export function LanguageSettingsForm() {
  const router = useRouter();
  const pathname = usePathname();
  const { dictionary, isLoading } = useAppStore();

  const currentLocale = pathname.split("/")[1] as Locale;

  const handleLanguageChange = (newLocale: string) => {
    const segments = pathname.split("/");
    segments[1] = newLocale;
    const newPath = segments.join("/");
    router.push(newPath);
  };

  if (isLoading || !dictionary) {
    return <LanguageSkeleton />;
  }

  const { title, description, options } = dictionary.settings.language;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Separator className="rounded-none" />

      <Select value={currentLocale} onValueChange={handleLanguageChange}>
        <SelectTrigger className="w-[180px] rounded-none h-8 text-xs font-normal border bg-background">
          <SelectValue placeholder={dictionary.settings.language.placeholder} />
        </SelectTrigger>
        <SelectContent className="rounded-none border bg-background">
          {Object.entries(options).map(([value, label]) => (
            <SelectItem
              key={value}
              value={value}
              className="rounded-none text-xs focus:bg-accent focus:text-accent-foreground"
            >
              <span className="text-xs">{label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
