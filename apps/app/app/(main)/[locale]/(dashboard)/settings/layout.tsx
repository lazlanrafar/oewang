import { Separator } from "@workspace/ui";

import { SettingSidebar } from "@/components/organisms/setting/setting-sidebar";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale as Locale);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col space-y-6 overflow-hidden md:h-[calc(100vh-3.5rem)]">
      <div className="flex-none space-y-0.5">
        <h2 className="font-bold text-2xl tracking-tight">{dictionary.navigation.settings}</h2>
        <p className="text-muted-foreground">Manage your account settings and preferences.</p>
        <Separator className="my-6" />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row lg:space-x-12 lg:space-y-0">
        <aside className="overflow-y-auto lg:w-1/5">
          <SettingSidebar dictionary={dictionary.settings} />
        </aside>
        <div className="flex-1 overflow-y-auto lg:max-w-2xl">{children}</div>
      </div>
    </div>
  );
}
