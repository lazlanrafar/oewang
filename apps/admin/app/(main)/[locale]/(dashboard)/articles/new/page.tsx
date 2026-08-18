import type { Metadata } from "next";

import { ArticleFormView } from "@/components/articles/article-form-view";

export const metadata: Metadata = { title: "New Article" };
export const dynamic = "force-dynamic";

export default function NewArticlePage() {
  return (
    <div className="h-full bg-background p-4">
      <ArticleFormView />
    </div>
  );
}
