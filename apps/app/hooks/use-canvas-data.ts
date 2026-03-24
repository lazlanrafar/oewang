"use client";

import { useChatMessages } from "@ai-sdk-tools/store";
import { useMemo } from "react";
import type { ArtifactType } from "@workspace/constants";

export function useCanvasData<T = any>(type: ArtifactType) {
  const chatData = useChatMessages();
  const messages = Array.isArray(chatData) ? chatData : (chatData as any)?.messages || [];

  const data = useMemo<T | null>(() => {
    // Search backwards for the latest message with this artifact type
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg || msg.role !== "assistant") continue;

      // First search in parts (AI SDK streaming format)
      const artifactPart = (msg as any).parts?.find(
        (p: any) => p.type === "artifact" && p.artifactType === type,
      );

      if (artifactPart) {
        return (artifactPart as any).payload as T;
      }

      // Then check in attachments (where we save from server-side non-streaming response)
      const attachmentArtifact = (msg as any).attachments?.artifact;
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
