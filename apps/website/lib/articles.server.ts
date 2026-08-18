// Fetches published articles from the API's PUBLIC endpoints (no auth, cached
// 1h server-side). Returns [] / null on any failure so pages degrade instead of
// throwing.
import { decrypt } from "@workspace/encryption";

export type PublicArticleListItem = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  published_at: string | null;
  created_at: string;
};

export type PublicArticle = PublicArticleListItem & {
  content: string | null;
};

// Unwrap the plaintext-or-AES transport the API fleet uses inconsistently.
function unwrap<T>(body: { data?: unknown }): T | null {
  if (typeof body.data === "string") {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) return null;
    return (JSON.parse(decrypt(body.data, key)) as { data?: T }).data ?? null;
  }
  return (body as { data?: T }).data ?? null;
}

export async function getPublicArticles(): Promise<PublicArticleListItem[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
  try {
    const res = await fetch(`${apiUrl}/public/articles`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const rows = unwrap<PublicArticleListItem[]>((await res.json()) as { data?: unknown });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function getPublicArticleBySlug(slug: string): Promise<PublicArticle | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
  try {
    const res = await fetch(`${apiUrl}/public/articles/${encodeURIComponent(slug)}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return unwrap<PublicArticle>((await res.json()) as { data?: unknown });
  } catch {
    return null;
  }
}
