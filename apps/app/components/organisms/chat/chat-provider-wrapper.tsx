"use client";

import { type ReactNode, useEffect, useMemo, useRef } from "react";

import { Provider as ChatProvider, createChatStore } from "@ai-sdk-tools/store";
import { sendChatMessage } from "@workspace/modules/ai/ai.action";
import { useChatInterface } from "@workspace/ui/hooks";
import type { UIMessage } from "ai";

interface Props {
  children: ReactNode;
  initialMessages?: UIMessage[];
}

export function ChatProviderWrapper({ children, initialMessages }: Props) {
  const { chatId, setChatId } = useChatInterface();
  const isAbortedRef = useRef(false);

  // Create a stable store instance
  const store = useMemo(() => createChatStore((initialMessages as any) || []), [initialMessages]);

  useEffect(() => {
    if (chatId) {
      const state = store.getState() as any;
      if (state.setId) {
        state.setId(chatId);
      }
    }
  }, [store, chatId]);

  useEffect(() => {
    // Inject our custom sendMessage and stop into the store
    const state = store.getState() as any;
    if (state._syncState) {
      state._syncState({
        sendMessage: async (
          input: string | UIMessage | Record<string, unknown>,
          options?: { metadata?: Record<string, unknown> },
        ) => {
          const messages = store.getState().messages;

          let userMessage: UIMessage;
          let attachments = options?.metadata?.attachments as Record<string, unknown>[];
          const webSearch = options?.metadata?.webSearch as boolean | undefined;

          if (typeof input === "string") {
            userMessage = {
              id: Date.now().toString(),
              role: "user",
              parts: [{ type: "text", text: input }],
            } as any;
          } else if (input && typeof input === "object" && "text" in input) {
            const inputObj = input as Record<string, unknown>;
            const files = (inputObj.files as Record<string, unknown>[] | undefined) ?? [];
            const fileParts = files.map((file) => ({
              type: "file",
              url: file.url as string,
              mediaType: file.mediaType as string,
              filename: file.filename as string,
            }));
            userMessage = {
              id: (inputObj.messageId as string) || Date.now().toString(),
              role: "user",
              parts: [{ type: "text", text: (input as any).text as string }, ...fileParts],
              metadata: inputObj.metadata as Record<string, unknown>,
            } as any;

            const metadata = inputObj.metadata as Record<string, unknown>;
            attachments = attachments || (metadata?.attachments as Record<string, unknown>[]);
          } else {
            userMessage = input as any;
          }

          const updatedMessages = [...messages, userMessage];

          state.setMessages(updatedMessages);
          state.setStatus("streaming");

          try {
            const backendMessages = updatedMessages.map((m) => {
              const mAny = m as any;
              const textContent =
                mAny.parts && Array.isArray(mAny.parts)
                  ? mAny.parts
                      .filter((p: any) => p.type === "text")
                      .map((p: any) => p.text as string)
                      .join("\n")
                  : (mAny.content as string) || "";

              return {
                role: m.role as "user" | "assistant",
                content: textContent,
                attachments:
                  m.role === "user" ? (mAny.metadata?.attachments as Record<string, unknown>[] | undefined) : undefined,
              };
            });

            isAbortedRef.current = false;

            // Attempt streaming via /api/chat/stream
            let streamedSuccessfully = false;
            try {
              const streamRes = await fetch("/api/chat/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  messages: backendMessages,
                  session_id: chatId || undefined,
                  web_search: webSearch ?? false,
                }),
              });

              if (streamRes.ok && streamRes.body) {
                const reader = streamRes.body.getReader();
                const decoder = new TextDecoder();
                let fullReply = "";
                let revealedLength = 0;
                // Latest tool_call event, surfaced as a real "tool-<name>" part so
                // the existing ChatStatusIndicators live status line (below the
                // messages) picks it up and renames itself via getToolMessage —
                // no separate status UI here, dropped once real reply text starts.
                let currentToolName: string | null = null;
                let toolCallCounter = 0;
                // Every canvas produced this turn — a "full breakdown" request can
                // call getSpendingAnalysis + getBurnRate + getDebtAnalysis in one
                // turn, each with its own canvas tab. Collecting them all (instead
                // of overwriting a single slot with whichever tool ran last) is
                // what makes chat-canvas.tsx's per-part tab list show every canvas,
                // correctly typed, instead of the last tool's type mislabeling
                // every tab from that turn.
                const currentArtifacts: any[] = [];
                // Set when the model calls present_choices — rendered as clickable
                // follow-up buttons below the reply, persists once set (like an
                // artifact), independent of the ephemeral tool-status line above.
                let choicesData: { question: string; options: { label: string; message: string }[] } | null = null;
                let buffer = "";
                let networkDone = false;

                const assistantMsgId = (Date.now() + 1).toString();

                const updateAssistantMessage = (isFinal = false) => {
                  const revealedReply = fullReply.slice(0, revealedLength);
                  const parts: any[] = [];
                  if (currentToolName && !revealedReply && !isFinal) {
                    parts.push({
                      type: `tool-${currentToolName}`,
                      toolCallId: `${currentToolName}-${toolCallCounter}`,
                      state: "input-available",
                      input: {},
                    });
                  }
                  if (revealedReply) {
                    parts.push({
                      type: "text",
                      text: revealedReply,
                    });
                  }
                  for (const artifact of currentArtifacts) {
                    parts.push({
                      type: `data-artifact-${artifact.type}`,
                      id: artifact.type,
                      artifactType: artifact.type,
                      data: {
                        id: artifact.type,
                        type: artifact.type,
                        status: isFinal ? "complete" : "streaming",
                        version: 1,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        payload: artifact.payload,
                        progress: isFinal ? 1 : 0.5,
                      },
                      artifact,
                    });
                  }
                  if (choicesData) {
                    parts.push({
                      type: "data-choices",
                      data: choicesData,
                    });
                  }

                  const assistantMessage: UIMessage = {
                    id: assistantMsgId,
                    role: "assistant",
                    parts: parts.length > 0 ? parts : [{ type: "text", text: "" }],
                    createdAt: new Date(),
                  } as any;

                  state.setMessages([...updatedMessages, assistantMessage]);
                };

                // Typewriter reveal — runs independently of chunk arrival so the
                // reply always types out smoothly on screen, even when the model
                // (or provider) delivers it in one or two large bursts instead of
                // token-by-token. Speeds up automatically for a long backlog so a
                // big reply doesn't take forever to finish appearing.
                const revealDone = new Promise<void>((resolve) => {
                  const tick = () => {
                    if (isAbortedRef.current) {
                      resolve();
                      return;
                    }
                    if (revealedLength < fullReply.length) {
                      const remaining = fullReply.length - revealedLength;
                      revealedLength += Math.max(1, Math.ceil(remaining / 10));
                      updateAssistantMessage(false);
                      setTimeout(tick, 20);
                    } else if (networkDone) {
                      updateAssistantMessage(true);
                      resolve();
                    } else {
                      setTimeout(tick, 20);
                    }
                  };
                  tick();
                });

                while (true) {
                  if (isAbortedRef.current) break;
                  const { done, value } = await reader.read();
                  if (done) break;

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n\n");
                  buffer = lines.pop() || "";

                  for (const block of lines) {
                    if (!block.trim()) continue;
                    let eventType = "message";
                    let eventData: any = null;

                    for (const line of block.split("\n")) {
                      if (line.startsWith("event: ")) {
                        eventType = line.slice(7).trim();
                      } else if (line.startsWith("data: ")) {
                        try {
                          eventData = JSON.parse(line.slice(6));
                        } catch {
                          eventData = line.slice(6);
                        }
                      }
                    }

                    if (eventType === "tool_call" && eventData?.name) {
                      currentToolName = eventData.name;
                      toolCallCounter++;
                      if (eventData.name === "present_choices" && eventData.args?.options) {
                        choicesData = {
                          question: eventData.args.question ?? "",
                          options: eventData.args.options,
                        };
                      }
                      updateAssistantMessage(false);
                    } else if (eventType === "content" && eventData?.text) {
                      fullReply += eventData.text;
                    } else if (eventType === "artifact" && eventData) {
                      currentArtifacts.push(eventData);
                      updateAssistantMessage(false);
                    } else if (eventType === "done" && eventData) {
                      if (eventData.reply && !fullReply) {
                        fullReply = eventData.reply;
                      }
                      // Each artifact already arrived via its own "artifact" event
                      // above — this only backfills if that never happened (e.g. a
                      // non-streaming response shape reusing this same handler).
                      if (!currentArtifacts.length && eventData.artifacts?.length) {
                        currentArtifacts.push(...eventData.artifacts);
                      }
                      if (!chatId && eventData.session_id) {
                        state.setId(eventData.session_id);
                        setChatId(eventData.session_id);
                      }
                    }
                  }
                }

                networkDone = true;
                await revealDone;
                state.setStatus("ready");
                streamedSuccessfully = true;
              }
            } catch (err) {
              console.warn("Stream failed, falling back to server action", err);
            }

            if (streamedSuccessfully || isAbortedRef.current) return;

            // Fallback non-streaming path
            const response = await sendChatMessage(backendMessages, chatId || undefined, attachments as any, webSearch);

            if (isAbortedRef.current) return;

            if (response.success && response.data) {
              const parts: any[] = [{ type: "text", text: response.data.reply }];

              // If backend returned canvases, add each as its own message part.
              // This format is required by @ai-sdk-tools/artifacts/client
              const artifacts = (response.data as any).artifacts ?? [];
              for (const artifact of artifacts) {
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
                  },
                });
              }

              const assistantMessage: UIMessage = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                parts,
                createdAt: new Date(),
              } as any;

              state.setMessages([...updatedMessages, assistantMessage]);
              state.setStatus("ready");

              if (!chatId && response.data.sessionId) {
                state.setId(response.data.sessionId);
                setChatId(response.data.sessionId);
              }
            } else {
              interface AIError extends Error {
                code?: string;
                meta?: Record<string, unknown>;
              }
              const errorObj: AIError = new Error(response.error || "Failed to get AI response");
              errorObj.code = response.code;
              errorObj.meta = response.meta as Record<string, unknown>;
              throw errorObj;
            }
          } catch (error: unknown) {
            if (isAbortedRef.current) return;
            state.setError(error as Error);
            state.setStatus("error");
          }
        },
        stop: () => {
          isAbortedRef.current = true;
          state.setStatus("ready");
        },
      });
    }
  }, [store, chatId, setChatId]);

  return <ChatProvider store={store as any}>{children}</ChatProvider>;
}
