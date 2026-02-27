"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

import {
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useSidebar,
} from "@workspace/ui";
import {
  ArrowLeft,
  ArrowUp,
  Globe,
  History,
  Plus,
  Search,
  Sparkles,
  Zap,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Check,
} from "lucide-react";

import { AiChart } from "@workspace/ui";

import {
  type ChatMessage,
  getChatSessionMessages,
  getChatSessions,
  sendChatMessage,
} from "@workspace/modules";
import { useAiChatStore } from "@/stores/ai-chat-store";

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: Date | string;
  messagesLoaded?: boolean;
};

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground/80">
      <span className="font-medium animate-pulse">Thinking</span>
      <div className="flex items-center gap-1 pb-1">
        <span
          className="h-1 w-1 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-1 w-1 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-1 w-1 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onRegenerate,
}: {
  message: ChatMessage;
  onRegenerate?: () => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = (type: "up" | "down") => {
    setFeedback(type);
    toast.success(
      type === "up" ? "Thanks for the feedback!" : "We'll try to improve.",
    );
    // Data is stored locally. An API call could be hooked up here.
  };

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] px-4 py-2.5 text-sm leading-relaxed overflow-hidden",
          isUser
            ? "rounded rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm text-foreground",
        )}
      >
        {isUser ? (
          message.content.split("\n").map((line, i) => (
            <span key={i}>
              {line}
              {i < message.content.split("\n").length - 1 && <br />}
            </span>
          ))
        ) : (
          <div className="markdown-content space-y-3">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                p: ({ children }) => (
                  <p className="mb-2 last:mb-0 leading-relaxed text-sm">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-5 mb-2 space-y-1">
                    {children}
                  </ol>
                ),
                li: ({ children }) => <li className="pl-1">{children}</li>,
                h1: ({ children }) => (
                  <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-lg font-semibold mt-3 mb-1">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-base font-semibold mt-2 mb-1">
                    {children}
                  </h3>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline underline-offset-4"
                  >
                    {children}
                  </a>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold">{children}</strong>
                ),
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || "");
                  const isChart = match && match[1] === "chart";

                  if (!inline && isChart) {
                    return (
                      <AiChart code={String(children).replace(/\n$/, "")} />
                    );
                  }

                  return !inline ? (
                    <div className="rounded-md bg-muted p-4 my-2 overflow-x-auto text-xs font-mono border shadow-sm">
                      <code {...props}>{children}</code>
                    </div>
                  ) : (
                    <code
                      className="bg-muted px-1.5 py-0.5 rounded-md text-xs font-mono border"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                table({ children }) {
                  return (
                    <div className="overflow-x-auto my-4 rounded-lg border">
                      <table className="w-full text-sm border-collapse">
                        {children}
                      </table>
                    </div>
                  );
                },
                th({ children }) {
                  return (
                    <th className="border-b bg-muted/50 p-3 text-left font-medium text-muted-foreground">
                      {children}
                    </th>
                  );
                },
                td({ children }) {
                  return (
                    <td className="border-b border-border/50 p-3 text-left align-top">
                      {children}
                    </td>
                  );
                },
                blockquote({ children }) {
                  return (
                    <blockquote className="border-l-4 border-primary/50 pl-4 py-1 italic text-muted-foreground bg-muted/30 rounded-r-md">
                      {children}
                    </blockquote>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
      {!isUser && (
        <div className="flex items-center gap-1 text-muted-foreground/60">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleCopy}
                className="p-1.5 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
                aria-label="Copy"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>Copy response</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleFeedback("up")}
                className={cn(
                  "p-1.5 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors",
                  feedback === "up" && "text-blue-500 bg-blue-500/10",
                )}
                aria-label="Good response"
              >
                <ThumbsUp
                  className={cn(
                    "w-3.5 h-3.5",
                    feedback === "up" && "fill-current",
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>Good response</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleFeedback("down")}
                className={cn(
                  "p-1.5 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors",
                  feedback === "down" && "text-destructive bg-destructive/10",
                )}
                aria-label="Bad response"
              >
                <ThumbsDown
                  className={cn(
                    "w-3.5 h-3.5",
                    feedback === "down" && "fill-current",
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>Bad response</TooltipContent>
          </Tooltip>

          {onRegenerate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onRegenerate}
                  className="p-1.5 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
                  aria-label="Regenerate"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Regenerate</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

export function AiChat() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    () => searchParams.get("chat") || null,
  );
  const [activePopover, setActivePopover] = useState<
    "none" | "history" | "suggestions"
  >("none");
  const [isLoaded, setIsLoaded] = useState(false);

  const { state, isMobile } = useSidebar();
  const setSendMessageFn = useAiChatStore((state) => state.setSendMessageFn);

  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === currentSessionId);
  const messages = activeSession ? activeSession.messages : [];
  const hasMessages = currentSessionId !== null && messages.length > 0;

  const sidebarOffset = isMobile ? 0 : state === "expanded" ? 256 : 48;

  const loadSessionMessages = async (
    id: string,
    fetchedSessions?: ChatSession[],
  ) => {
    const listToCheck = fetchedSessions || sessions;
    const session = listToCheck.find((s) => s.id === id);
    if (session && !session.messagesLoaded) {
      const res = await getChatSessionMessages(id);
      if (res.success && res.data) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, messages: res.data!, messagesLoaded: true }
              : s,
          ),
        );
      }
    }
  };

  useEffect(() => {
    if (isLoaded) return;

    const fetchSessions = async () => {
      const res = await getChatSessions();
      let updatedSessions: ChatSession[] = [];
      if (res.success && res.data) {
        updatedSessions = res.data.map((s) => ({
          ...s,
          messages: [],
          messagesLoaded: false,
        }));
        setSessions(updatedSessions);
      }
      setIsLoaded(true);

      const initialChatId = searchParams.get("chat");
      if (initialChatId) {
        loadSessionMessages(initialChatId, updatedSessions);
      }
    };
    fetchSessions();
  }, [isLoaded, searchParams]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (currentSessionId) {
      if (params.get("chat") !== currentSessionId) {
        params.set("chat", currentSessionId);
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }
    } else {
      if (params.has("chat")) {
        params.delete("chat");
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }
    }
  }, [currentSessionId, pathname, router, searchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        chatContainerRef.current &&
        !chatContainerRef.current.contains(event.target as Node)
      ) {
        setActivePopover("none");
      }
    };

    if (activePopover !== "none") {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activePopover]);

  // Define sendMessage here so it's available for the ref and effects
  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    let sessionId = currentSessionId;
    // We will optimistically create a temporary session id if none exists
    const isNewSession = !sessionId;
    if (isNewSession) {
      sessionId = crypto.randomUUID();
      setCurrentSessionId(sessionId);
      setSessions((prev) => [
        {
          id: sessionId!,
          title: trimmed.slice(0, 30) + (trimmed.length > 30 ? "..." : ""),
          messages: [],
          updatedAt: new Date(),
          messagesLoaded: true,
        },
        ...prev,
      ]);
    }

    const userMessage: ChatMessage = { role: "user", content: trimmed };

    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              messages: [...s.messages, userMessage],
              updatedAt: new Date(),
            }
          : s,
      ),
    );

    setInput("");
    setIsLoading(true);
    setActivePopover("none");

    startTransition(async () => {
      try {
        const currentMessages = activeSession ? activeSession.messages : [];
        const result = await sendChatMessage(
          [...currentMessages, userMessage],
          isNewSession ? undefined : (sessionId ?? undefined),
        );

        if (result.success && result.data) {
          const actualSessionId = result.data.sessionId || sessionId;

          if (isNewSession && result.data.sessionId) {
            setCurrentSessionId(actualSessionId);
          }

          setSessions((prev) => {
            // If it's a new session, we need to replace the temporary ID with the real one
            const updated = prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    id: actualSessionId!,
                    messages: [
                      ...s.messages,
                      {
                        role: "assistant" as const,
                        content: result.data!.reply,
                      },
                    ],
                    updatedAt: new Date(),
                  }
                : s,
            );
            return updated;
          });
        } else {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    messages: [
                      ...s.messages,
                      {
                        role: "assistant",
                        content:
                          result.error ??
                          "Something went wrong. Please try again.",
                      },
                    ],
                    updatedAt: new Date(),
                  }
                : s,
            ),
          );
        }
      } catch {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: [
                    ...s.messages,
                    {
                      role: "assistant",
                      content:
                        "Failed to connect. Please check your connection and try again.",
                    },
                  ],
                  updatedAt: new Date(),
                }
              : s,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    });
  };

  const sendMessageRef = useRef(sendMessage);
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  useEffect(() => {
    setSendMessageFn((msg) => {
      sendMessageRef.current(msg);
    });
  }, [setSendMessageFn]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {hasMessages && (
        <style>{`
          .dashboard-content-tabs { display: none !important; }
          .dashboard-greeting { display: none !important; }
        `}</style>
      )}

      {/* Inline Chat History Area */}
      {hasMessages && (
        <div className="flex-1 w-full flex flex-col animate-in fade-in duration-300 relative">
          {/* Top Header matching the screenshot */}
          <div className="sticky top-[47px] z-10 flex items-center justify-between px-4 py-2 bg-background/80 backdrop-blur">
            <button
              onClick={() => setCurrentSessionId(null)}
              className="w-10 h-10 border border-border/80 bg-background flex items-center justify-center rounded-lg hover:bg-muted transition-colors shadow-sm"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <div className="text-sm font-medium">
              {activeSession?.title || "Greeting and Introduction"}
            </div>
            <button
              onClick={() => setCurrentSessionId(null)}
              className="w-10 h-10 border border-border/80 bg-background flex items-center justify-center rounded-lg hover:bg-muted transition-colors shadow-sm"
              title="New Chat"
            >
              <Plus className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col pt-16 pb-[140px]">
            <div className="flex flex-col gap-6 px-4 w-full h-full">
              <div className="flex items-center justify-center my-4">
                <div className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                  Today
                </div>
              </div>

              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  message={msg}
                  onRegenerate={
                    !isLoading &&
                    i === messages.length - 1 &&
                    msg.role === "assistant"
                      ? () => {
                          // Try to send the last user message again
                          const lastUserMsg = [...messages]
                            .reverse()
                            .find((m) => m.role === "user");
                          if (lastUserMsg) sendMessage(lastUserMsg.content);
                        }
                      : undefined
                  }
                />
              ))}

              {isLoading && (
                <div className="flex items-start gap-2">
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="w-3 h-3" />
                  </div>
                  <div className="rounded rounded-tl-sm bg-transparent shadow-none">
                    <TypingIndicator />
                  </div>
                </div>
              )}
              <div ref={bottomRef} className="h-4" />
            </div>
          </div>
        </div>
      )}

      {/* Floating Input Container */}
      <TooltipProvider delayDuration={300}>
        <div
          ref={chatContainerRef}
          className="fixed bottom-10 z-50 flex flex-col items-center w-full max-[768px]:px-4 md:w-full md:max-w-3xl transition-all duration-200 ease-linear"
          style={{
            left: `calc(50% + ${sidebarOffset / 2}px)`,
            transform: "translateX(-50%)",
          }}
        >
          {/* Chat History Popover */}
          {activePopover === "history" && (
            <div className="absolute bottom-full left-0 mb-4 w-full bg-background/80 backdrop-blur-xl border border-border/80 shadow-sm p-0 max-h-[400px] overflow-hidden flex flex-col z-50 animate-in slide-in-from-bottom-2 rounded">
              <div className="sticky top-0 p-2 border-b border-border/50">
                <div className="flex items-center bg-background/50 border border-border/50 rounded-xl px-3 py-2">
                  <Search className="w-4 h-4 text-muted-foreground mr-2 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search history"
                    className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <div className="p-2 flex flex-col overflow-y-auto">
                {sessions.length === 0 ? (
                  <div className="text-sm text-muted-foreground px-4 py-8 text-center">
                    No recent chats
                  </div>
                ) : (
                  sessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => {
                        setCurrentSessionId(session.id);
                        loadSessionMessages(session.id);
                        setActivePopover("none");
                      }}
                      className="w-full flex items-center justify-between px-3 py-3 text-sm rounded-lg hover:bg-muted transition-colors text-left cursor-pointer"
                    >
                      <span className="truncate pr-4 font-medium text-foreground">
                        {session.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(session.updatedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Suggested Prompts Popover */}
          {activePopover === "suggestions" && (
            <div className="absolute bottom-full left-0 mb-4 w-full bg-background/80 backdrop-blur-xl border border-border/80 shadow-sm p-0 max-h-[400px] overflow-hidden flex flex-col z-50 animate-in slide-in-from-bottom-2 rounded">
              <div className="p-2 flex flex-col overflow-y-auto">
                {[
                  "Show balance sheet",
                  "Show growth rate analysis",
                  "Analyze revenue growth trends",
                  "Show invoice payment analysis",
                  "Analyze customer payment patterns",
                  "Show tax summary",
                  "Show tax breakdown by category",
                  "Show business health score",
                  "Analyze business health metrics",
                  "Show revenue forecast",
                ].map((promptText, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(promptText)}
                    className="w-full text-left px-3 py-3 text-sm rounded-lg hover:bg-muted transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Auto-sizing Input Bar */}
          <div className="w-full bg-white/50 dark:bg-background/20 backdrop-blur-xl shadow-sm border border-border/50 flex flex-col overflow-hidden transition-all rounded">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.min(e.target.scrollHeight, 200) + "px";
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything"
              disabled={isLoading}
              rows={1}
              className={cn(
                "w-full resize-none bg-transparent outline-none p-4 placeholder:text-muted-foreground text-sm",
                "disabled:cursor-not-allowed",
              )}
              style={{ minHeight: "60px", maxHeight: "200px" }}
            />

            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1.5">
                {/* <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="p-2 text-muted-foreground cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors"
                      aria-label="Add attachment"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Add attachment</TooltipContent>
                </Tooltip> */}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() =>
                        setActivePopover(
                          activePopover === "suggestions"
                            ? "none"
                            : "suggestions",
                        )
                      }
                      className={cn(
                        "p-2 text-muted-foreground cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors",
                        activePopover === "suggestions" &&
                          "bg-black/5 dark:bg-white/5 text-foreground",
                      )}
                      aria-label="Suggested actions"
                    >
                      <Zap className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Suggested actions</TooltipContent>
                </Tooltip>

                {/* <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="p-2 text-muted-foreground cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors"
                      aria-label="Web search"
                    >
                      <Globe className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Web search</TooltipContent>
                </Tooltip> */}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() =>
                        setActivePopover(
                          activePopover === "history" ? "none" : "history",
                        )
                      }
                      className={cn(
                        "p-2 text-muted-foreground cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors",
                        activePopover === "history" &&
                          "bg-black/5 dark:bg-white/5 text-foreground",
                      )}
                      aria-label="Chat History"
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Chat History</TooltipContent>
                </Tooltip>
              </div>

              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => sendMessage(input)}
                      disabled={isLoading || !input.trim()}
                      className={cn(
                        "w-8 h-8 flex items-center justify-center rounded transition-all",
                        input.trim() && !isLoading
                          ? "bg-[#1A1A1A] text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-gray-200"
                          : "bg-muted text-muted-foreground cursor-not-allowed opacity-50",
                        "cursor-pointer",
                      )}
                      aria-label="Send message"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Send message</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      </TooltipProvider>
    </>
  );
}
