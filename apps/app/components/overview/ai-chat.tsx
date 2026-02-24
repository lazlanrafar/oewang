"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { sendChatMessage, type ChatMessage } from "@/actions/ai.actions";
import { cn } from "@workspace/ui";
import {
  X,
  ArrowLeft,
  Plus,
  CornerDownLeft,
  Sparkles,
  MessageCircle,
  Wallet,
  TrendingUp,
  Receipt,
  LineChart,
  PieChart,
} from "lucide-react";

const SUGGESTION_CHIPS = [
  {
    icon: <Wallet className="w-3.5 h-3.5" />,
    label: "Wallet balances",
    message: "What are my current wallet balances?",
  },
  {
    icon: <LineChart className="w-3.5 h-3.5" />,
    label: "Spending analysis",
    message: "Give me a spending analysis for the last 30 days.",
  },
  {
    icon: <Receipt className="w-3.5 h-3.5" />,
    label: "Latest transactions",
    message: "Show me my latest transactions.",
  },
  {
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    label: "Monthly summary",
    message:
      "Give me a summary of my income vs expenses over the last 3 months.",
  },
  {
    icon: <PieChart className="w-3.5 h-3.5" />,
    label: "Top expenses",
    message: "What categories am I spending the most on?",
  },
];

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <span
        className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
        style={{ animationDelay: "300ms" }}
      />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="w-3 h-3" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] px-4 py-2.5 text-sm leading-relaxed shadow-sm",
          isUser
            ? "rounded-2xl rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-2xl rounded-tl-sm bg-muted text-foreground",
        )}
      >
        {message.content.split("\n").map((line, i) => (
          <span key={i}>
            {line}
            {i < message.content.split("\n").length - 1 && <br />}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasMessages = messages.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    startTransition(async () => {
      try {
        const result = await sendChatMessage(updatedMessages);
        if (result.success && result.data) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: result.data!.reply },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                result.error ?? "Something went wrong. Please try again.",
            },
          ]);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Failed to connect. Please check your connection and try again.",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    });
  };

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
          {/* Sticky Navigation Buttons */}
          <div className="absolute top-0 left-0 z-10">
            <button
              onClick={() => setMessages([])}
              className="text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur border border-border/50 shadow-sm p-2 rounded-xl transition-colors flex items-center justify-center"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
          <div className="absolute top-0 right-0 z-10">
            <button
              onClick={() => setMessages([])}
              className="text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur border border-border/50 shadow-sm p-2 rounded-xl transition-colors flex items-center justify-center"
              title="Clear Chat"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col pt-2 pb-[140px]">
            <div className="flex flex-col gap-6 px-4 w-full h-full">
              <div className="flex items-center justify-center my-4">
                <div className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                  Today
                </div>
              </div>

              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} />
              ))}

              {isLoading && (
                <div className="flex items-start gap-2">
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="w-3 h-3" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-muted shadow-sm">
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
      <div className="relative bottom-4 left-1/2 -translate-x-1/2 w-full max-w-3xl z-50 flex flex-col items-center">
        {/* Suggestion Chips (only show when no messages) */}
        {!hasMessages && (
          <div className="w-full flex flex-wrap justify-center gap-2 mb-4">
            {SUGGESTION_CHIPS.map((chip) => (
              <button
                key={chip.label}
                onClick={() => sendMessage(chip.message)}
                disabled={isLoading}
                className={cn(
                  "rounded-full border border-border/50 bg-background/80 backdrop-blur px-3 py-1.5 text-xs font-medium shadow-sm transition-all",
                  "hover:border-primary/30 hover:bg-muted hover:text-foreground",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  "flex items-center gap-1.5 text-muted-foreground",
                )}
              >
                {chip.icon}
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* Auto-sizing Input Bar */}
        <div className="w-full rounded-2xl border border-border/80 bg-background/90 backdrop-blur-md shadow-lg focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all flex items-end p-2 gap-2">
          <div className="mb-1.5 ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageCircle className="w-4 h-4" />
          </div>

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
            placeholder="Ask Okane anything..."
            disabled={isLoading}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/70 py-2",
              "disabled:cursor-not-allowed",
            )}
            style={{ minHeight: "36px", maxHeight: "200px" }}
          />

          <button
            onClick={() => sendMessage(input)}
            disabled={isLoading || !input.trim()}
            className={cn(
              "mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all shadow-sm",
              input.trim() && !isLoading
                ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow"
                : "bg-muted text-muted-foreground cursor-not-allowed opacity-70",
            )}
          >
            <CornerDownLeft className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
