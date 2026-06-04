import type { Dictionary } from "@workspace/dictionaries";
import { Button, cn, SimpleIcon } from "@workspace/ui";
import { siGithub, siGoogle } from "simple-icons";

interface OAuthButtonProps extends React.ComponentProps<"a"> {
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
    <Button variant="outline" className={cn("w-full bg-transparent", className)} asChild>
      <a href={`/api/auth/${provider}`} {...props}>
        <SimpleIcon icon={icon} className="me-2 size-4" />
        {label ?? defaultLabel}
      </a>
    </Button>
  );
}
