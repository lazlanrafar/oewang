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
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row lg:space-x-12 lg:space-y-0">
        <aside className="overflow-y-auto lg:w-1/5">
          <SettingSidebar dictionary={dictionary.settings} />
        </aside>
        <div className="flex-1 overflow-y-auto lg:max-w-3xl">{children}</div>
      </div>
    </div>
  );
}
