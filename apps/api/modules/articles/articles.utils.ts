// Clean URL slug for the public blog: lowercase, collapse any run of
// non-alphanumerics to a single dash, trim leading/trailing dashes.
// Uniqueness is handled in the service (DB check + short suffix), not here.
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "article"
  );
}
