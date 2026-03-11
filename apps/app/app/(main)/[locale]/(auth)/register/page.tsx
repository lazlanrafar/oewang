import Link from "next/link";

import { OAuthButton } from "@/components/organisms/auth/oauth-button";
import { RegisterForm } from "@/components/organisms/auth/register-form";

export default function RegisterV2() {
  return (
    <>
      <div className="mx-auto flex w-full flex-col justify-center space-y-10 sm:w-[400px] p-4 sm:p-0">
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <div className="space-y-3">
            <h1 className="text-2xl tracking-tight font-sans">
              Welcome to Okane
            </h1>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-3">
            <OAuthButton provider="google" className="" />
            <OAuthButton provider="github" className="" />
          </div>

          <div className="relative text-center text-sm py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-4 text-muted-foreground text-sm">
                or
              </span>
            </div>
          </div>

          <details className="group">
            <summary className="flex h-11 w-full cursor-pointer items-center justify-center rounded-md border border-border bg-transparent px-4 py-2 text-sm font-normal text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground list-none transition-colors">
              Show other options
            </summary>
            <div className="mt-6 animate-in slide-in-from-top-2 fade-in-0 duration-200">
              <RegisterForm />
            </div>
          </details>
        </div>

        <div className="flex w-full justify-center px-10 pointer-events-none">
          <p className="text-center text-sm text-muted-foreground max-w-[400px]">
            By signing up you agree to our{" "}
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground pointer-events-auto"
            >
              Terms of service
            </Link>
            &{" "}
            <Link
              href="/policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground pointer-events-auto"
            >
              Privacy policy
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
