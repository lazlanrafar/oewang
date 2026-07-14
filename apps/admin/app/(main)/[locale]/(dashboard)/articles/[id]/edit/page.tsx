import { notFound } from "next/navigation";

import { getArticle } from "@workspace/modules/article/article.action";
import type { Metadata } from "next";

import { ArticleFormView } from "@/components/articles/article-form-view";

export const metadata: Metadata = { title: "Edit Article" };
export const dynamic = "force-dynamic";

export default async function EditArticlePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const res = await getArticle(id);
  if (!res.success) notFound();

  return (
    <div className="h-full bg-background p-4">
      <ArticleFormView initialData={res.data} />
    </div>
  );
}
