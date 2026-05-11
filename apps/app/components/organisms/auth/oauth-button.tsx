"use client";

import type { Dictionary } from "@workspace/dictionaries";
import { loginWithOAuth } from "@workspace/modules/auth/auth.action";
import { Button, cn, SimpleIcon } from "@workspace/ui";
import { siGithub, siGoogle } from "simple-icons";
import { toast } from "sonner";

interface OAuthButtonProps extends React.ComponentProps<typeof Button> {
  provider: "google" | "github";
  label?: string;
  dictionary: Dictionary;
}

export function OAuthButton({ provider, className, label, dictionary, ...props }: OAuthButtonProps) {
  const icon = provider === "google" ? siGoogle : siGithub;
  const defaultLabel =
    provider === "google"
      ? dictionary.auth.social.google || "Continue with Google"
      : dictionary.auth.social.github || "Continue with GitHub";

  return (
    <Button
      variant="outline"
      className={cn("w-full bg-transparent", className)}
      onClick={async () => {
        const result = await loginWithOAuth(provider);
        if (result && !result.success) {
          toast.error(result.error);
        }
      }}
      {...props}
    >
      <SimpleIcon icon={icon} className="me-2 size-4" />
      {label ?? defaultLabel}
    </Button>
  );
}
