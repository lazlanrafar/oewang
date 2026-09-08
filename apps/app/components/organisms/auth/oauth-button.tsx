import type { Dictionary } from "@workspace/dictionaries";
import { Button, cn, SimpleIcon } from "@workspace/ui";
import { siFacebook, siGithub, siGoogle } from "simple-icons";

interface OAuthButtonProps extends React.ComponentProps<"a"> {
  provider: "google" | "github" | "facebook";
  label?: string;
  dictionary: Dictionary;
}

const ICONS = { google: siGoogle, github: siGithub, facebook: siFacebook };
const DEFAULT_LABELS = {
  google: "Continue with Google",
  github: "Continue with GitHub",
  facebook: "Continue with Facebook",
};

export function OAuthButton({ provider, className, label, dictionary, ...props }: OAuthButtonProps) {
  const icon = ICONS[provider];
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
          <SimpleIcon icon={icon} className="me-2 size-4" />
          {label ?? defaultLabel} (coming soon)
        </>
      ) : (
        <a href={`/api/auth/${provider}`} {...props}>
          <SimpleIcon icon={icon} className="me-2 size-4" />
          {label ?? defaultLabel}
        </a>
      )}
    </Button>
  );
}
