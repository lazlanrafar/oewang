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
  const { reset, sendMessage } = useChatActions();
  const { setScrollY, setIsHome } = useChatStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

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

  // Whether the user has deliberately scrolled away from the bottom to read
  // history. Set by a real scroll event below — NOT recomputed as "distance
  // from bottom" on every content tick, because fast-streaming content can
  // legitimately grow faster than our own catch-up scroll, pushing the
  // measured distance past any fixed threshold and permanently (mis)reading
  // as "user scrolled up" for the rest of that stream. Our own programmatic
  // scrolls only ever move toward the bottom, so `ignoreNextScrollRef` is
  // enough to keep them from ever flipping this flag.
  const userScrolledAwayRef = useRef(false);
  const ignoreNextScrollRef = useRef(false);
  const NEAR_BOTTOM_PX = 120;

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (ignoreNextScrollRef.current) {
        ignoreNextScrollRef.current = false;
        return;
      }
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledAwayRef.current = distFromBottom > NEAR_BOTTOM_PX;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll to bottom as new messages/streaming updates arrive. Re-runs on
  // every message content change (not just status transitions) so it keeps
  // following the reply as it types out, like WhatsApp — but only while the
  // user hasn't scrolled up to read history. Sending your own message always
  // snaps down regardless of prior scroll position (checked via the last
  // message's role, NOT `status === "submitted"` — this app's custom
  // sendMessage jumps straight from "ready" to "streaming" and never emits
  // "submitted", so gating on that status value silently never fired).
  //
  // Scrolls the container to its true max (scrollHeight), not an end-marker
  // via scrollIntoView({block:"end"}) — the input bar floats "fixed bottom-0"
  // on top of the scroll container's own bottom edge, so aligning a
  // zero-height marker to the viewport edge leaves the last line or two of
  // text hidden underneath it. Only scrolling all the way to scrollHeight
  // reaches the trailing `pb-32` clearance reserved for that overlay.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages isn't read in the body — it's a re-run trigger so this scrolls again as message content grows during streaming.
  useEffect(() => {
    const scrollEl = messagesScrollRef.current;
    if (!scrollEl) return;
    const justSentByUser = messages[messages.length - 1]?.role === "user";
    if (justSentByUser) userScrolledAwayRef.current = false;
    if (userScrolledAwayRef.current) return;

    const behavior = status === "streaming" || justSentByUser ? "auto" : "smooth";
    // No requestAnimationFrame here — rAF can be throttled or skipped entirely
    // by the browser for a backgrounded/occluded tab, which would silently
    // drop every scroll call during a long stream. The DOM is already updated
    // by the time this effect runs, so scrolling synchronously is safe.
    ignoreNextScrollRef.current = true;
    scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior });
  }, [status, messages]);

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

              <div ref={messagesScrollRef} className="scrollbar-hide flex-1 overflow-y-auto px-4 md:px-0">
                <div className="mx-auto w-full max-w-2xl pb-32">
                  <ChatMessages
                    messages={messages as any}
                    isStreaming={status === "streaming" || status === "submitted"}
                    dictionary={dictionary}
                    onQuickReply={(text) => sendMessage({ text })}
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
