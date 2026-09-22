"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

type OAuthErrorDictionary = {
  oauth_state_mismatch: string;
  oauth_config_missing: string;
  oauth_failed: string;
  generic: string;
};

export function OAuthErrorToast({
  dictionary,
}: {
  dictionary: OAuthErrorDictionary;
}) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  // biome-ignore lint/correctness/useExhaustiveDependencies: dictionary is a static object from the server; only the URL's error code should re-trigger this
  useEffect(() => {
    if (!error) return;
    const message =
      dictionary[error as keyof OAuthErrorDictionary] ?? dictionary.generic;
    toast.error(message);
  }, [error]);

  return null;
}
