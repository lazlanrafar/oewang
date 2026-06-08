"use client";

import { useState } from "react";
import { Button } from "@workspace/ui";

interface Props {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state?: string;
  codeChallenge?: string;
}

export function OAuthConsentClient({
  clientId,
  clientName,
  redirectUri,
  state,
  codeChallenge,
}: Props) {
  const [loading, setLoading] = useState(false);

  const handleDecision = async (allow: boolean) => {
    setLoading(true);

    if (!allow) {
      const url = new URL(redirectUri);
      url.searchParams.set("error", "access_denied");
      url.searchParams.set("error_description", "User denied access");
      if (state) url.searchParams.set("state", state);
      window.location.href = url.toString();
      return;
    }

    try {
      const res = await fetch("/api/oauth/code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge ?? null,
        }),
      });

      if (!res.ok) {
        alert("Failed to create authorization code. Please try again.");
        setLoading(false);
        return;
      }

      const { code } = await res.json();
      const url = new URL(redirectUri);
      url.searchParams.set("code", code);
      if (state) url.searchParams.set("state", state);
      window.location.href = url.toString();
    } catch {
      alert("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col space-y-8 p-4">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded border border-border bg-secondary font-bold text-xl uppercase">
          {clientName.charAt(0)}
        </div>
        <h1 className="font-medium text-xl">{clientName}</h1>
        <p className="text-muted-foreground text-sm">
          wants to connect to your Oewang account
        </p>
      </div>

      <div className="space-y-2 rounded border border-border bg-secondary/40 p-4">
        <p className="font-medium text-xs text-muted-foreground uppercase tracking-widest">
          This app will be able to
        </p>
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" />
            Read your transactions, wallets, and budgets
          </li>
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" />
            Create and update transactions on your behalf
          </li>
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" />
            Access your categories and contacts
          </li>
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          onClick={() => handleDecision(true)}
          disabled={loading}
          className="w-full"
        >
          Allow access
        </Button>
        <Button
          variant="outline"
          onClick={() => handleDecision(false)}
          disabled={loading}
          className="w-full"
        >
          Deny
        </Button>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Connecting to{" "}
        <span className="font-mono text-[10px]">
          {new URL(redirectUri).hostname}
        </span>
      </p>
    </div>
  );
}
