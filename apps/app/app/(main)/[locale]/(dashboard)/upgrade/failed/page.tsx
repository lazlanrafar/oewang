import Link from "next/link";

import { Button } from "@workspace/ui";
import { XCircle } from "lucide-react";

import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function FailedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 ring-8 ring-red-50">
        <XCircle className="h-10 w-10 text-red-600" />
      </div>

      <div className="text-center">
        <h1 className="font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
          {dict.settings.billing.failed.title}
        </h1>
        <p className="mt-2 max-w-md text-muted-foreground">{dict.settings.billing.failed.description}</p>
      </div>

      <div className="flex gap-4">
        <Button asChild variant="outline">
          <Link href={`/${locale}/upgrade`}>{dict.settings.billing.failed.back_to_pricing}</Link>
        </Button>
        <Button asChild>
          <Link href={`/${locale}/upgrade`}>{dict.settings.billing.failed.try_again}</Link>
        </Button>
      </div>
    </div>
  );
}
