"use client";

import { useMemo } from "react";

import { useChatMessages } from "@ai-sdk-tools/store";
import type { ArtifactType } from "@workspace/constants";

export function useCanvasData<T = unknown>(type: ArtifactType) {
  const chatData = useChatMessages();
  const messages = Array.isArray(chatData)
    ? chatData
    : ((chatData as Record<string, unknown>)?.messages as unknown[]) || [];

  const data = useMemo<T | null>(() => {
    // Search backwards for the latest message with this artifact type
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgRecord = messages[i] as Record<string, unknown>;
      if (!msgRecord || msgRecord.role !== "assistant") continue;
      const parts = msgRecord.parts as Record<string, unknown>[] | undefined;
      const artifactPart = parts?.find((p) => p.type === "artifact" && p.artifactType === type);

      if (artifactPart) {
        return (artifactPart as Record<string, unknown>).payload as T;
      }

      // Then check in attachments (where we save from server-side non-streaming response)
      const attachments = msgRecord.attachments as Record<string, unknown> | undefined;
      const attachmentArtifact = attachments?.artifact as Record<string, unknown> | undefined;
      if (attachmentArtifact && attachmentArtifact.type === type) {
        return attachmentArtifact.payload as T;
      }
    }

    return null;
  }, [messages, type]);

  return {
    data,
    status: data ? "ready" : "loading",
  };
}
