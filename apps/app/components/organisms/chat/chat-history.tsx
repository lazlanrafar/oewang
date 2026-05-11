"use client";

import { createContext, type ReactNode, type RefObject, useContext, useEffect, useRef, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getChatSessions } from "@workspace/modules/ai/ai.action";
import { AnimatedSizeContainer, cn, Icons, Input, Skeleton } from "@workspace/ui";
import { formatDistanceToNow } from "date-fns";
import { useDebounceCallback, useOnClickOutside } from "usehooks-ts";

const ChatHistoryContext = createContext<{
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
} | null>(null);

export function useChatHistoryContext() {
  const context = useContext(ChatHistoryContext);
  if (!context) {
    throw new Error("useChatHistoryContext must be used within ChatHistoryProvider");
  }
  return context;
}

function ChatHistorySkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={`chat-skeleton-${i + 1}`} className="flex items-center justify-between px-2 py-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ChatHistoryProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return <ChatHistoryContext.Provider value={{ isOpen, setIsOpen }}>{children}</ChatHistoryContext.Provider>;
}

export function ChatHistory() {
  return (
    <ChatHistoryProvider>
      <ChatHistoryButton />
    </ChatHistoryProvider>
  );
}

export function ChatHistoryButton() {
  const { isOpen, setIsOpen } = useChatHistoryContext();

  return (
    <button
      type="button"
      data-chat-history-button
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        "flex h-6 cursor-pointer items-center transition-colors duration-200",
        isOpen
          ? "rounded-full bg-[rgba(0,0,0,0.05)] hover:bg-[rgba(0,0,0,0.08)] dark:bg-[rgba(255,255,255,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)]"
          : "hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.05)]",
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center">
        <Icons.History
          size={16}
          className={cn(
            "transition-colors",
            isOpen
              ? "text-black dark:text-white"
              : "text-[#707070] hover:text-[#999999] dark:text-[#666666] dark:hover:text-[#999999]",
          )}
        />
      </span>
    </button>
  );
}

export function ChatHistoryDropdown() {
  const _router = useRouter();
  const queryClient = useQueryClient();
  const historyListRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { isOpen, setIsOpen } = useChatHistoryContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Debounced search to avoid too many API calls
  const debouncedSearch = useDebounceCallback(setSearchQuery, 300);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      // Small delay to ensure the dropdown is rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      // Reset selected index when opening
      setSelectedIndex(-1);
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useOnClickOutside(historyListRef as RefObject<HTMLElement>, (event) => {
    if (isOpen) {
      const target = event.target as Element;
      const clickedButton = target.closest("button");
      const isHistoryButton = clickedButton?.closest("[data-chat-history-button]");

      // Don't close if clicking on the history button itself
      if (!isHistoryButton) {
        setIsOpen(false);
      }
    }
  });

  // Scroll selected chat into view
  useEffect(() => {
    if (historyListRef.current && selectedIndex >= 0) {
      const selectedElement = historyListRef.current.querySelector(`[data-chat-index="${selectedIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  const { data: sessionsResponse, isLoading } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => getChatSessions(),
    enabled: isOpen,
  });

  const _deleteMutation = useMutation({
    mutationFn: (_id: string) => {
      // return deleteChatSession(id); // Placeholder for delete action
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });

  if (!isOpen) return null;

  const chats = (sessionsResponse?.data ?? []).flatMap((chat) =>
    chat?.id
      ? [
          {
            id: chat.id,
            title: chat.title,
            updatedAt: chat.updatedAt,
          },
        ]
      : [],
  );

  const formatUpdatedAt = (value?: string) => {
    if (!value) return "Recently";
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) return "Recently";
    return formatDistanceToNow(parsedDate, { addSuffix: true });
  };

  return (
    <div ref={historyListRef} data-chat-history-menu className="absolute right-0 bottom-full left-0 z-100 mb-2 w-full">
      <AnimatedSizeContainer
        height
        className="flex max-h-80 flex-col overflow-hidden bg-[#f7f7f7]/85 backdrop-blur-lg dark:bg-[#171717]/85"
        transition={{
          type: "spring",
          duration: 0.2,
          bounce: 0.1,
          ease: "easeOut",
        }}
        style={{
          transformOrigin: "bottom center",
        }}
      >
        <div className="sticky top-0 z-10 shrink-0 bg-[#f7f7f7]/85 p-2 pb-2 backdrop-blur-lg dark:bg-[#171717]/85">
          <div className="relative">
            <Icons.Search
              className="-translate-y-1/2 absolute top-1/2 left-2 transform text-muted-foreground"
              size={14}
            />
            <Input
              ref={searchInputRef}
              placeholder="Search history"
              className="h-8 border-0 bg-black/5 pl-8 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-white/5"
              onChange={(e) => {
                debouncedSearch(e.target.value);
                setSelectedIndex(-1);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <div className="scrollbar-hide max-h-[calc(20rem-3.5rem)] min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="p-2 pt-0">
            {isLoading ? (
              <ChatHistorySkeleton />
            ) : chats.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground text-sm">
                  {searchQuery ? "No chats found" : "No chat history"}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {chats.map((chat, index) => {
                  if (!chat) return null;
                  const isSelected = selectedIndex === index;
                  return (
                    <Link
                      key={chat.id}
                      href={`/chat/${chat.id}`}
                      data-chat-index={index}
                      className={cn(
                        "group relative flex h-[32px] cursor-pointer items-center justify-between px-2 py-2 text-sm no-underline transition-colors",
                        isSelected ? "bg-black/5 dark:bg-white/5" : "hover:bg-black/5 dark:hover:bg-white/5",
                      )}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => setIsOpen(false)}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="ml-2 line-clamp-1 text-[#666] dark:text-[#999]">
                          {chat.title || "New chat"}
                        </span>
                      </div>
                      <div className="ml-2 flex min-w-0 shrink-0 items-center gap-2">
                        <span className="whitespace-nowrap text-[#666] text-xs transition-all duration-200 group-hover:mr-1 dark:text-[#999]">
                          {formatUpdatedAt(chat.updatedAt)}
                        </span>
                        <button
                          type="button"
                          className="pointer-events-none w-0 shrink-0 overflow-hidden rounded-sm p-1 opacity-0 transition-all duration-200 hover:bg-destructive/10 group-hover:pointer-events-auto group-hover:w-6 group-hover:opacity-100"
                          title="Delete chat"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Implementation for deleteChat soon
                          }}
                        >
                          <Icons.Delete size={14} className="text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </AnimatedSizeContainer>
    </div>
  );
}
