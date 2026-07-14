"use client";

import { ScrollArea, Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui";

import { useArticleStore } from "@/stores/articles";

import { ArticleForm } from "./article-form";

export function ArticleSheet() {
  const { isOpen, close, mode, selectedArticle } = useArticleStore();

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent className="flex flex-col">
        <SheetHeader className="mb-3">
          <SheetTitle>{mode === "create" ? "Create Article" : "Edit Article"}</SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-full">
          <ArticleForm key={selectedArticle?.id ?? "create"} initialData={selectedArticle} onSuccess={close} />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
