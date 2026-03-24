"use client";

import { useChatStore } from "@/stores/chat";
import { cn, Conversation, ConversationContent, Portal, useSidebar } from "@workspace/ui";
import { ChatInput } from "./chat-input";
import { ChatHistoryProvider } from "./chat-history";
import { useChatInterface, useChatStatus } from "@workspace/ui/hooks";
import { useEffect, useMemo, useRef } from "react";
import {
  useChatActions,
  useChatId as useSDKChatId,
  useChatMessages,
  useChatStatus as useSDKChatStatus,
  useDataPart,
} from "@ai-sdk-tools/store";
import type { Geo } from "@vercel/functions";
import { generateId } from "ai";
import { parseAsString, useQueryState } from "nuqs";
import dynamic from "next/dynamic";
import { ChatHeader } from "./chat-header";
import { ChatMessages } from "./chat-messages";
import { ChatStatusIndicators } from "./chat-status-indicators";

// Dynamically load Canvas - only loads when user opens an artifact
const Canvas = dynamic(
  () => import("./canvas/chat-canvas").then((mod) => mod.Canvas),
  { ssr: false },
);

type Props = {
  geo?: Geo;
};

export default function ChatInterface({ geo }: Props) {
  const { state: sidebarState } = useSidebar();
  const {
    chatId: routeChatId,
    setChatId,
    isHome: routeIsHome,
  } = useChatInterface();
  const chatIdFromStore = useSDKChatId();
  const { reset } = useChatActions();
  const { setScrollY, setIsHome } = useChatStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const chatId = useMemo(() => routeChatId ?? generateId(), [routeChatId]);
  const prevChatIdRef = useRef<string | null>(routeChatId);

  const messages = useChatMessages();
  const status = useSDKChatStatus();

  const [, clearSuggestions] = useDataPart<{ prompts: string[] }>(
    "suggestions",
  );

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

    const getScrollParent = (
      node: HTMLElement | null,
    ): HTMLElement | Window => {
      if (!node) return window;
      const overflowY = window.getComputedStyle(node).overflowY;
      const isScrollable =
        overflowY !== "visible" &&
        overflowY !== "hidden" &&
        overflowY !== "clip";
      if (isScrollable) {
        return node;
      }
      return getScrollParent(node.parentElement);
    };

    const scrollParent = getScrollParent(element);

    const handleScroll = () => {
      const scrollTop =
        scrollParent === window
          ? window.scrollY
          : (scrollParent as HTMLElement).scrollTop;
      setScrollY(scrollTop);
    };

    scrollParent.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => scrollParent.removeEventListener("scroll", handleScroll);
  }, [setScrollY, effectiveIsHome, hasMessages]);

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

  const [, setSelectedType] = useQueryState("artifact-type", parseAsString);


  return (
    <ChatHistoryProvider>
      <div
        ref={containerRef}
        className={cn(
          "relative flex flex-row size-full scroll-smooth",
          !effectiveIsHome
            ? "h-[calc(100vh-88px)] overflow-hidden"
            : "h-auto min-h-[100px] pb-24",
        )}
      >
        {/* Canvas slides in from right when artifacts are present */}
        <div
          className={cn(
            "fixed right-0 top-[48px] bottom-0 z-40 w-full md:w-[600px] bg-background/95 backdrop-blur-xl border-l border-border/50 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
            showCanvas ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="h-[calc(100vh-48px)] flex flex-col relative">
            <div className="absolute inset-0 bg-linear-to-b from-primary/5 to-transparent pointer-events-none opacity-50" />
            <Canvas />
          </div>
        </div>

        {hasMessages && (
          <div
            className={cn(
              "flex-1 min-h-0 flex flex-col relative transition-all duration-300 ease-in-out",
              showCanvas && "mr-0 md:mr-[600px]",
            )}
          >
            {/* Conversation view - messages with absolute positioning for proper height */}
            <div className="absolute inset-0 flex flex-col">
              <div
                className={cn(
                  "sticky top-0 left-0 z-10 shrink-0 outline-none transition-all duration-300 ease-in-out",
                )}
              >
                <div className="bg-background/80 dark:bg-background/50 backdrop-blur-sm">
                  <div className="mx-auto w-full px-4 md:px-0">
                    <ChatHeader />
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 md:px-0 scroll-smooth">
                <div className="max-w-2xl mx-auto w-full pb-32">
                  <ChatMessages
                    messages={messages}
                    isStreaming={
                      status === "streaming" || status === "submitted"
                    }
                  />
                  <ChatStatusIndicators
                    agentStatus={agentStatus}
                    currentToolCall={currentToolCall}
                    status={status}
                    artifactStage={artifactStage}
                    artifactType={artifactType}
                    currentSection={currentSection}
                    bankAccountRequired={bankAccountRequired}
                    hasTextContent={hasTextContent}
                    hasInsightData={hasInsightData}
                  />
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
            "flex justify-center items-end pointer-events-none pb-6",
            showCanvas && "mr-0 md:mr-[600px]",
          )}
        >
          <div className="w-full max-w-[770px] px-4 pointer-events-auto">
            <ChatInput />
          </div>
        </div>
      </div>
    </ChatHistoryProvider>
  );
}
