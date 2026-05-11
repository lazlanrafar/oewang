"use client";

import { useEffect, useMemo, useRef } from "react";

import dynamic from "next/dynamic";

import {
  useChatActions,
  useChatMessages,
  useDataPart,
  useChatError as useSDKChatError,
  useChatId as useSDKChatId,
  useChatStatus as useSDKChatStatus,
} from "@ai-sdk-tools/store";
import type { Dictionary } from "@workspace/dictionaries";
import { cn, useSidebar } from "@workspace/ui";
import { useChatInterface, useChatStatus } from "@workspace/ui/hooks";
import { generateId } from "ai";
import { parseAsString, useQueryState } from "nuqs";

import { useChatStore } from "@/stores/chat";

import { ChatHeader } from "./chat-header";
import { ChatHistoryProvider } from "./chat-history";
import { ChatInput } from "./chat-input";
import { ChatMessages } from "./chat-messages";
import { ChatStatusIndicators } from "./chat-status-indicators";

// Dynamically load Canvas - only loads when user opens an artifact
const Canvas = dynamic(() => import("./canvas/chat-canvas").then((mod) => mod.Canvas), { ssr: false });

type Props = {
  dictionary: Dictionary;
};

export default function ChatInterface({ dictionary }: Props) {
  const { state: sidebarState } = useSidebar();
  const { chatId: routeChatId } = useChatInterface();
  const _chatIdFromStore = useSDKChatId();
  const { reset } = useChatActions();
  const { setScrollY, setIsHome } = useChatStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const _chatId = useMemo(() => routeChatId ?? generateId(), [routeChatId]);
  const prevChatIdRef = useRef<string | null>(routeChatId);

  const messages = useChatMessages();
  const status = useSDKChatStatus();
  const sdkError = useSDKChatError();

  const error = useMemo(() => {
    if (!sdkError || typeof sdkError !== "object") return undefined;

    const maybeError = sdkError as { code?: unknown; meta?: unknown };
    const code = typeof maybeError.code === "string" ? maybeError.code : undefined;

    let resetAt: string | undefined;
    if (maybeError.meta && typeof maybeError.meta === "object") {
      const meta = maybeError.meta as { reset_at?: unknown };
      resetAt = typeof meta.reset_at === "string" ? meta.reset_at : undefined;
    }

    if (!code && !resetAt) return undefined;

    return {
      code,
      meta: resetAt ? { reset_at: resetAt } : undefined,
    };
  }, [sdkError]);

  const [, clearSuggestions] = useDataPart<{ prompts: string[] }>("suggestions");

  const [selectedType] = useQueryState("artifact-type", parseAsString);

  // Reset chat state when navigating away from a chat (sidebar, browser back, etc.)
  useEffect(() => {
    const prevChatId = prevChatIdRef.current;
    const currentChatId = routeChatId;

    // If we had a chatId before and now we don't (navigated away), reset
    // Or if we're switching to a different chatId, reset
    if (prevChatId && prevChatId !== currentChatId) {
      reset();
      clearSuggestions();
      setScrollY(0);
    }

    // Update the ref for next comparison
    prevChatIdRef.current = currentChatId;
  }, [routeChatId, reset, clearSuggestions, setScrollY]);

  const hasMessages = messages.length > 0;
  const showCanvas = Boolean(selectedType);

  // Unified isHome logic: true only if no chatId in route AND no messages
  const effectiveIsHome = !routeChatId && !hasMessages;

  // Track robust scroll (searching for nearest scrollable container)
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const getScrollParent = (node: HTMLElement | null): HTMLElement | Window => {
      if (!node) return window;
      const overflowY = window.getComputedStyle(node).overflowY;
      const isScrollable = overflowY !== "visible" && overflowY !== "hidden" && overflowY !== "clip";
      if (isScrollable) {
        return node;
      }
      return getScrollParent(node.parentElement);
    };

    const scrollParent = getScrollParent(element);

    const handleScroll = () => {
      const scrollTop = scrollParent === window ? window.scrollY : (scrollParent as HTMLElement).scrollTop;
      setScrollY(scrollTop);
    };

    scrollParent.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => scrollParent.removeEventListener("scroll", handleScroll);
  }, [setScrollY]);

  const {
    agentStatus,
    currentToolCall,
    artifactStage,
    artifactType,
    currentSection,
    bankAccountRequired,
    hasTextContent,
    hasInsightData,
  } = useChatStatus(messages, status);

  // Sync isHome to store so ChatInput and other components stay in sync
  useEffect(() => {
    setIsHome(effectiveIsHome);
  }, [effectiveIsHome, setIsHome]);

  // Auto-scroll to bottom as new messages/streaming updates arrive
  useEffect(() => {
    if (!messagesEndRef.current) return;

    const behavior = status === "streaming" || status === "submitted" ? "auto" : "smooth";

    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }, [messages, status]);

  const [, _setSelectedType] = useQueryState("artifact-type", parseAsString);

  return (
    <ChatHistoryProvider>
      <div
        ref={containerRef}
        className={cn(
          "relative flex size-full flex-row scroll-smooth",
          !effectiveIsHome ? "h-[calc(100vh-88px)] overflow-hidden" : "h-auto min-h-[100px] pb-24",
        )}
      >
        {/* Canvas slides in from right when artifacts are present */}
        <div
          className={cn(
            "fixed top-[48px] right-0 bottom-0 z-40 w-full border-border/50 border-l bg-background/95 backdrop-blur-xl transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] md:w-[600px]",
            showCanvas ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="relative flex h-[calc(100vh-48px)] flex-col">
            <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-primary/5 to-transparent opacity-50" />
            <Canvas />
          </div>
        </div>

        {hasMessages && (
          <div
            className={cn(
              "relative flex min-h-0 flex-1 flex-col transition-all duration-300 ease-in-out",
              showCanvas && "mr-0 md:mr-[600px]",
            )}
          >
            {/* Conversation view - messages with absolute positioning for proper height */}
            <div className="absolute inset-0 flex flex-col">
              <div
                className={cn("sticky top-0 left-0 z-10 shrink-0 outline-none transition-all duration-300 ease-in-out")}
              >
                <div className="bg-background/80 backdrop-blur-sm dark:bg-background/50">
                  <div className="mx-auto w-full px-4 md:px-0">
                    <ChatHeader dictionary={dictionary} />
                  </div>
                </div>
              </div>

              <div className="scrollbar-hide flex-1 overflow-y-auto scroll-smooth px-4 md:px-0">
                <div className="mx-auto w-full max-w-2xl pb-32">
                  <ChatMessages
                    messages={messages}
                    isStreaming={status === "streaming" || status === "submitted"}
                    dictionary={dictionary}
                  />
                  <ChatStatusIndicators
                    agentStatus={agentStatus}
                    currentToolCall={currentToolCall}
                    status={status}
                    error={error}
                    dictionary={dictionary}
                    artifactStage={artifactStage}
                    artifactType={artifactType}
                    currentSection={currentSection}
                    bankAccountRequired={bankAccountRequired}
                    hasTextContent={hasTextContent}
                    hasInsightData={hasInsightData}
                  />
                  <div ref={messagesEndRef} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div
          className={cn(
            "fixed bottom-0 z-30 transition-all duration-300 ease-in-out",
            sidebarState === "collapsed" ? "left-0 md:left-(--sidebar-width-icon)" : "left-0 md:left-(--sidebar-width)",
            "right-0",
            "pointer-events-none flex items-end justify-center pb-6",
            showCanvas && "mr-0 md:mr-[600px]",
          )}
        >
          <div className="pointer-events-auto w-full max-w-[770px] px-4">
            <ChatInput dictionary={dictionary} />
          </div>
        </div>
      </div>
    </ChatHistoryProvider>
  );
}
