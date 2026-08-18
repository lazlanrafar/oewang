// Fetches published FAQs from the API's PUBLIC endpoint (no auth, cached 1h
// server-side). Returns the { q, a } shape the FAQ section + JSON-LD already
// use, or [] on any failure so the page falls back to the dictionary copy.
import { decrypt } from "@workspace/encryption";

export type PublicFaqItem = { q: string; a: string };

type RawFaq = { question: string; answer: string };

export async function getPublicFaqs(): Promise<PublicFaqItem[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
  try {
    const res = await fetch(`${apiUrl}/public/faq`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: unknown };

    // Some API instances AES-encrypt the transport ({ data: "iv:ct" }); others
    // return plaintext ({ data: [...] }). Handle both.
    let payload: { data?: RawFaq[] };
    if (typeof body.data === "string") {
      const key = process.env.ENCRYPTION_KEY;
      if (!key) return [];
      payload = JSON.parse(decrypt(body.data, key));
    } else {
      payload = body as { data?: RawFaq[] };
    }

    const rows = Array.isArray(payload.data) ? payload.data : [];
    return rows.map((f) => ({ q: f.question, a: f.answer }));
  } catch {
    return [];
  }
}
