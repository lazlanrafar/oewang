"use client";

import { useChatInterface } from "@workspace/ui/hooks";
import { 
  Provider as ChatProvider, 
  createChatStore, 
  type StoreState 
} from "@ai-sdk-tools/store";
import { 
  extractArtifactTypeFromMessage,
  getArtifactSectionMessageForStatus 
} from "@workspace/constants";
import { sendChatMessage } from "@workspace/modules/ai/ai.action";
import { useMemo, useEffect, type ReactNode } from "react";
import type { UIMessage } from "ai";

interface Props {
  children: ReactNode;
  initialMessages?: UIMessage[];
}

export function ChatProviderWrapper({ children, initialMessages }: Props) {
  const { chatId, setChatId } = useChatInterface();
  
  // Create a stable store instance
  const store = useMemo(() => createChatStore(initialMessages || []), [initialMessages]);

  useEffect(() => {
    if (chatId) {
      const state = store.getState() as any;
      if (state.setId) {
        state.setId(chatId);
      }
    }
  }, [store, chatId]);

  useEffect(() => {
    // Inject our custom sendMessage into the store
    const state = store.getState() as any;
    if (state._syncState) {
      state._syncState({
        sendMessage: async (input: any, options?: { metadata?: any }) => {
          const messages = store.getState().messages;
          
          let userMessage: UIMessage;
          let attachments = options?.metadata?.attachments;

          if (typeof input === "string") {
            userMessage = {
              id: Date.now().toString(),
              role: "user",
              parts: [{ type: "text", text: input }],
            } as UIMessage;
          } else if (input && typeof input === "object" && "text" in input) {
            userMessage = {
              id: input.messageId || Date.now().toString(),
              role: "user",
              parts: [{ type: "text", text: input.text }],
              metadata: input.metadata,
            } as unknown as UIMessage;
            attachments = attachments || input.metadata?.attachments;
          } else {
            userMessage = input;
          }

          const updatedMessages = [...messages, userMessage];
          
          state.setMessages(updatedMessages);
          state.setStatus("streaming");

          try {
            const backendMessages = updatedMessages.map((m) => {
              const textContent = (m as any).parts
                ?.filter((p: any) => p.type === "text")
                .map((p: any) => p.text)
                .join("\n") || (m as any).content || "";
              
              return {
                role: m.role as "user" | "assistant",
                content: textContent,
              };
            });

            const response = await sendChatMessage(
              backendMessages,
              chatId || undefined,
              attachments
            );

            if (response.success && response.data) {
              const parts: any[] = [{ type: "text", text: response.data.reply }];
              
              // If backend returned an artifact, add it as a message part
              // This format is required by @ai-sdk-tools/artifacts/client
              const artifact = (response.data as any).artifact;
              if (artifact) {
                parts.push({
                  type: `data-artifact-${artifact.type}`,
                  id: artifact.type,
                  artifactType: artifact.type,
                  data: {
                    id: artifact.type,
                    type: artifact.type,
                    status: "complete",
                    version: 1,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    payload: artifact.payload,
                    progress: 1,
                  },
                  artifact: {
                    id: artifact.type,
                    type: artifact.type,
                    payload: artifact.payload,
                  }
                });
              }

              const assistantMessage: UIMessage = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                parts,
                createdAt: new Date(),
              } as UIMessage;

              state.setMessages([...updatedMessages, assistantMessage]);
              state.setStatus("ready");

              if (!chatId && response.data.sessionId) {
                state.setId(response.data.sessionId);
                setChatId(response.data.sessionId);
              }
            } else {
              throw new Error(response.error || "Failed to get AI response");
            }
          } catch (error: any) {
            state.setError(error);
            state.setStatus("error");
          }
        }
      });
    }
  }, [store, chatId, setChatId]);

  return (
    <ChatProvider store={store as any}>
      {children}
    </ChatProvider>
  );
}
