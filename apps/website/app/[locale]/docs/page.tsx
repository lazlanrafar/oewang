import { redirect } from "next/navigation";

import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return createPageMetadata({
    locale,
    path: "/docs",
    title: "API documentation",
    description: "Open Oewang API documentation for integration, automation, and developer workflows.",
    keywords: ["Oewang API docs", "finance API", "developer documentation", "Swagger finance API"],
  });
}

export default function DocsPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
  redirect(`${apiBase}/swagger`);
}
