"use client";

import { ScrollArea, Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui";

import { useFaqStore } from "@/stores/faqs";

import { FaqForm } from "./faq-form";

export function FaqSheet() {
  const { isOpen, close, mode, selectedFaq } = useFaqStore();

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent className="flex flex-col">
        <SheetHeader className="mb-3">
          <SheetTitle>{mode === "create" ? "Create FAQ" : "Edit FAQ"}</SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-full">
          <FaqForm key={selectedFaq?.id ?? "create"} initialData={selectedFaq} onSuccess={close} />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
