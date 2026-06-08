import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Locale } from "@/i18n-config";
import { OAuthConsentClient } from "./consent-client";

interface SearchParams {
  client_id?: string;
  redirect_uri?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  response_type?: string;
}

export default async function OAuthAuthorizePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);

  const { client_id, redirect_uri, state, code_challenge } = sp;

  if (!client_id || !redirect_uri) {
    redirect(`/${locale}/login`);
  }

  // Check session
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("oewang-session")?.value;
  if (!sessionToken) {
    const returnTo = encodeURIComponent(
      `/oauth/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}${state ? `&state=${state}` : ""}${code_challenge ? `&code_challenge=${code_challenge}&code_challenge_method=S256` : ""}`,
    );
    redirect(`/${locale}/login?returnTo=${returnTo}`);
  }

  // Fetch client name from the API's DCR registry
  const apiUrl = process.env.API_BASE_URL ?? "http://localhost:3002";
  let clientName = client_id;
  try {
    const res = await fetch(`${apiUrl}/oauth/client/${client_id}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      clientName = data.client_name ?? client_id;
    }
  } catch {
    // fall back to client_id
  }

  return (
    <OAuthConsentClient
      clientId={client_id!}
      clientName={clientName}
      redirectUri={redirect_uri!}
      state={state}
      codeChallenge={code_challenge}
    />
  );
}
