import Link from "next/link";

import type { Metadata } from "next";

import { OAuthButton } from "@/components/organisms/auth/oauth-button";
import { RegisterForm } from "@/components/organisms/auth/register-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Register",
};

export default async function RegisterPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <div className="mx-auto flex w-full flex-col justify-center space-y-8 p-4 sm:w-[400px] sm:p-0">
      <div className="space-y-2 text-center">
        <h1 className="font-sans text-2xl tracking-tight">{dictionary.auth.register_title}</h1>
      </div>

      <RegisterForm dictionary={dictionary} />

      <div className="relative py-1 text-center">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-border border-t" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-4 text-muted-foreground text-sm">{dictionary.auth.or}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <OAuthButton provider="google" dictionary={dictionary} />
        <OAuthButton provider="github" dictionary={dictionary} />
      </div>

      <p className="text-center text-muted-foreground text-sm">
        {dictionary.auth.already_have_account}{" "}
        <Link
          href={`/${locale}/login`}
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
        >
          {dictionary.auth.sign_in}
        </Link>
      </p>

      <div className="pointer-events-none flex w-full justify-center">
        <p className="max-w-[400px] text-center text-muted-foreground text-xs">
          {dictionary.auth.terms_privacy_agreement}{" "}
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto underline underline-offset-4 hover:text-foreground"
          >
            {dictionary.auth.terms_of_service}
          </Link>
          {" & "}
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
