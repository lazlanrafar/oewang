import type { Dictionary } from "@workspace/dictionaries";
import { Button, cn } from "@workspace/ui";

import { AppleIcon, FacebookIcon, GithubIcon, GoogleIcon } from "./oauth-icons";

interface OAuthButtonProps extends React.ComponentProps<"a"> {
  provider: "google" | "github" | "facebook" | "apple";
  label?: string;
  dictionary: Dictionary;
}

const ICONS = { google: GoogleIcon, github: GithubIcon, facebook: FacebookIcon, apple: AppleIcon };
const DEFAULT_LABELS = {
  google: "Continue with Google",
  github: "Continue with GitHub",
  facebook: "Continue with Facebook",
  apple: "Continue with Apple",
};

export function OAuthButton({ provider, className, label, dictionary, ...props }: OAuthButtonProps) {
  const Icon = ICONS[provider];
  const defaultLabel = dictionary.auth.social[provider] || DEFAULT_LABELS[provider];
  // ponytail: Facebook OAuth isn't wired yet (needs a Facebook app + backend
  // route like /api/auth/google) — stub the button until it is.
  const comingSoon = provider === "facebook";

  return (
    <Button
      variant="outline"
      className={cn("w-full bg-transparent", className)}
      disabled={comingSoon}
      asChild={!comingSoon}
    >
      {comingSoon ? (
        <>
          <Icon className="me-2 size-4" />
          {label ?? defaultLabel} (coming soon)
        </>
      ) : (
        <a href={`/api/auth/${provider}`} {...props}>
          <Icon className="me-2 size-4" />
          {label ?? defaultLabel}
        </a>
      )}
    </Button>
  );
}
