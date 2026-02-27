"use client";

import { ActionResponse } from "@workspace/types";
import { Button, cn, SimpleIcon } from "@workspace/ui";
import { siGithub, siGoogle } from "simple-icons";
import { toast } from "sonner";

import { loginWithOAuth } from "@workspace/modules";

interface OAuthButtonProps extends React.ComponentProps<typeof Button> {
  provider: "google" | "github";
  label?: string;
}

export function OAuthButton({ provider, className, label, ...props }: OAuthButtonProps) {
  const icon = provider === "google" ? siGoogle : siGithub;
  const defaultLabel = provider === "google" ? "Continue with Google" : "Continue with GitHub";

  return (
    <Button
      variant="secondary"
      className={cn(className)}
      onClick={async () => {
        const result = await loginWithOAuth(provider);
        if (result && !result.success) {
          toast.error(result.error);
        }
      }}
      {...props}
    >
      <SimpleIcon icon={icon} className="size-4" />
      {label ?? defaultLabel}
    </Button>
  );
}
