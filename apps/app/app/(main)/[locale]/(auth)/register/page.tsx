import Link from "next/link";

import type { Metadata } from "next";

import { OAuthButton } from "@/components/organisms/auth/oauth-button";
import { RegisterForm } from "@/components/organisms/auth/register-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Register",
};

export default async function RegisterV2({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <div className="mx-auto flex w-full flex-col justify-center space-y-10 p-4 sm:w-[400px] sm:p-0">
      <div className="flex flex-col items-center justify-center space-y-4 text-center">
        <div className="space-y-3">
          <h1 className="font-sans text-2xl tracking-tight">{dictionary.auth.welcome}</h1>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3">
          <OAuthButton provider="google" className="" dictionary={dictionary} />
          <OAuthButton provider="github" className="" dictionary={dictionary} />
        </div>

        <div className="relative py-2 text-center text-sm">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-border border-t" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-4 text-muted-foreground text-sm">{dictionary.auth.or}</span>
          </div>
        </div>

        <details className="group">
          <summary className="flex h-11 w-full cursor-pointer list-none items-center justify-center rounded-md border border-border bg-transparent px-4 py-2 font-normal text-foreground text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
            {dictionary.auth.show_other_options}
          </summary>
          <div className="slide-in-from-top-2 fade-in-0 mt-6 animate-in duration-200">
            <RegisterForm dictionary={dictionary} />
          </div>
        </details>
      </div>

      <div className="pointer-events-none flex w-full justify-center px-10">
        <p className="max-w-[400px] text-center text-muted-foreground text-sm">
          {dictionary.auth.terms_privacy_agreement}{" "}
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto underline underline-offset-4 hover:text-foreground"
          >
            {dictionary.auth.terms_of_service}
          </Link>
          &{" "}
          <Link
            href="/policy"
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto underline underline-offset-4 hover:text-foreground"
          >
            {dictionary.auth.privacy_policy}
          </Link>
        </p>
      </div>
    </div>
  );
}
