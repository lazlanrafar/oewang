"use client";

import { useCallback } from "react";

import { useRouter } from "next/navigation";

import { BaseCanvas, Button, CanvasContent, CanvasHeader, Icons } from "@workspace/ui";
import { useAppStore } from "@/stores/app";
import { getDictionaryText } from "../chat-i18n";

export function CanvasErrorFallback() {
  const router = useRouter();
  const dictionary = useAppStore((state) => state.dictionary);
  const t = (key: string, fallback: string) => getDictionaryText(dictionary, key, fallback);

  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <BaseCanvas>
      <CanvasHeader title={t("chat.canvas.error.title", "Error")} />
      <CanvasContent>
        <div className="flex h-full min-h-[400px] flex-col items-center justify-center py-8">
          <div className="mb-6 text-muted-foreground text-sm">
            {t("chat.canvas.error.loading_content", "Error loading content")}
          </div>
          <Button variant="outline" size="sm" onClick={handleGoBack} className="flex items-center gap-2">
            <Icons.ArrowBack className="size-4" />
            {t("chat.canvas.error.go_back", "Go back")}
          </Button>
        </div>
      </CanvasContent>
    </BaseCanvas>
  );
}
