"use client";

import { useChatStore } from "@/stores/chat";
import {
  useChatActions,
  useChatId,
  useChatStatus,
  useDataPart,
} from "@ai-sdk-tools/store";
import {
  cn,
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@workspace/ui";
import { useChatInterface } from "@workspace/ui/hooks";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  ChatHistoryButton,
  ChatHistoryDropdown,
  ChatHistoryProvider,
  useChatHistoryContext,
} from "./chat-history";
import { ChatWebSearchButton } from "./chat-web-search-button";
import { ChatCommandMenu } from "./chat-command-menu";
import { ChatSuggestionButton } from "./chat-suggestion-button";
import { sendChatMessage } from "@workspace/modules/ai/ai.action";

export interface ChatInputMessage extends PromptInputMessage {
  metadata?: {
    agentChoice?: string;
    toolChoice?: string;
  };
}

export function ChatInput() {
  const [mounted, setMounted] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isInteractingWithButtons, setIsInteractingWithButtons] =
    useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isTypingRef = useRef(false);
  const prevInputRef = useRef("");
  const textReveal = useMotionValue(100);
  const textOpacity = useMotionValue(1);
  const status = useChatStatus();
  const chatId = useChatId();

  const { setChatId } = useChatInterface();
  //   const { isMetricsTab } = useOverviewTab();
  const { sendMessage, stop } = useChatActions();
  const { isOpen: isHistoryOpen, setIsOpen: setHistoryOpen } =
    useChatHistoryContext();

  const [, clearSuggestions] = useDataPart<{ prompts: string[] }>(
    "suggestions",
  );

  const {
    isHome,
    input,
    isWebSearch,
    isUploading,
    isRecording,
    isProcessing,
    showCommands,
    selectedCommandIndex,
    filteredCommands,
    setInput,
    setShowCommands,
    handleInputChange,
    handleKeyDown,
    resetCommandState,
    scrollY,
  } = useChatStore();

  const prevShowCommands = useRef(showCommands);
  const prevHistoryOpen = useRef(isHistoryOpen);

  useEffect(() => {
    // Commands just opened - close history
    if (showCommands && !prevShowCommands.current && isHistoryOpen) {
      setHistoryOpen(false);
    }
    // History just opened - close commands
    if (isHistoryOpen && !prevHistoryOpen.current && showCommands) {
      setShowCommands(false);
    }

    prevShowCommands.current = showCommands;
    prevHistoryOpen.current = isHistoryOpen;
  }, [showCommands, isHistoryOpen, setHistoryOpen, setShowCommands]);

  const MAX_SCROLL = 400;
  const baseMinimizationFactor = Math.max(0, Math.min(1, scrollY / MAX_SCROLL));

  // Override to full size (factor = 0) when:
  const shouldPreventMinimization =
    isFocused ||
    showCommands ||
    isHistoryOpen ||
    isInteractingWithButtons ||
    input.trim();

  const targetMinimizationFactor = shouldPreventMinimization
    ? 0
    : baseMinimizationFactor;

  const minimizationFactor = useMotionValue(targetMinimizationFactor);
  const prevShouldPreventMinimization = useRef(shouldPreventMinimization);

  useEffect(() => {
    const focusStateChanged =
      prevShouldPreventMinimization.current !== shouldPreventMinimization;
    prevShouldPreventMinimization.current = shouldPreventMinimization;

    if (focusStateChanged) {
      // Animate smoothly when focus/blur
      animate(minimizationFactor, targetMinimizationFactor, {
        type: "spring",
        stiffness: 300,
        damping: 30,
      });
    } else {
      // Update immediately for scroll
      minimizationFactor.set(targetMinimizationFactor);
    }
  }, [targetMinimizationFactor, shouldPreventMinimization, minimizationFactor]);

  // Transform reveal value to clipPath
  const textClipPath = useTransform(
    textReveal,
    (value) => `inset(0 ${100 - value}% 0 0)`,
  );

  // Reveal animation when text is added externally (not by typing)
  useEffect(() => {
    // Only animate if input changed and it wasn't from typing
    const wasExternalChange =
      input !== prevInputRef.current && !isTypingRef.current && input;

    if (wasExternalChange) {
      // Set initial state - start hidden
      textReveal.set(0);
      textOpacity.set(0);

      // Use requestAnimationFrame to ensure the initial state is painted
      requestAnimationFrame(() => {
        animate(textReveal, 100, {
          duration: 0.7,
          ease: [0.25, 0.1, 0.25, 1], // smooth cubic-bezier
        });
        animate(textOpacity, 1, {
          duration: 0.5,
          ease: [0.25, 0.1, 0.25, 1],
        });
      });
    }

    prevInputRef.current = input;
    isTypingRef.current = false;
  }, [input, textReveal, textOpacity]);

  const containerMaxWidth = useTransform(
    minimizationFactor,
    (factor) => `${770 - factor * (770 - 400)}px`,
  );

  const containerBorderRadius = "0"; // Fixed subtle rounding

  const containerBg = useTransform(
    minimizationFactor,
    (factor) => `rgba(247, 247, 247, ${0.85 - factor * 0.45})`,
  );

  const containerDarkBg = useTransform(
    minimizationFactor,
    (factor) => `rgba(19, 19, 19, ${0.7 - factor * 0.4})`,
  );

  const containerShadow = useTransform(minimizationFactor, (factor) => {
    const opacity = 0.05 - factor * 0.05;
    return `0 4px 12px rgba(0,0,0,${opacity})`;
  });

  // Container padding - keep constant, don't animate
  const containerPadding = 0;

  // Button animations - fade out early (by factor 0.4)
  const buttonOpacity = useTransform(minimizationFactor, (factor) => {
    // Fade out completely by factor 0.4
    if (factor >= 0.4) return 0;
    return 1 - factor / 0.4;
  });
  const buttonScale = useTransform(minimizationFactor, (factor) => {
    // Subtle scale from 1 to 0.95
    return 1 - factor * 0.05;
  });
  const buttonPointerEvents = useTransform(minimizationFactor, (factor) =>
    factor > 0.1 ? "none" : "auto",
  );

  // Toolbar wrapper - simple linear collapse
  const toolbarMaxHeight = useTransform(minimizationFactor, (factor) => {
    // Collapse from 56px (content + padding) to 0
    return 56 * (1 - factor);
  });
  const toolbarOpacity = useTransform(minimizationFactor, (factor) => {
    // Fade out completely by factor 0.4
    if (factor >= 0.4) return 0;
    return 1 - factor / 0.4;
  });

  // Body layout - smoothly interpolate gap and flex properties
  const bodyGap = useTransform(
    minimizationFactor,
    (factor) => 12 - factor * 12, // From 12px to 0px
  );
  const bodyPaddingRight = useTransform(
    minimizationFactor,
    (factor) => 0 + factor * 8, // From 0px to 8px
  );

  // Layout direction - use a lower threshold (0.15) for smoother transition
  const containerFlexDirection = useTransform(minimizationFactor, (factor) =>
    factor > 0.15 ? "row" : "column",
  );
  const bodyFlexDirection = useTransform(minimizationFactor, (factor) =>
    factor > 0.15 ? "row" : "column",
  );
  // Height animation - expanded (55px) vs minimized (52px)
  const inputWrapperHeight = useTransform(minimizationFactor, (factor) => {
    // Expanded: 55px, Minimized: 52px
    return 55 - factor * (55 - 52);
  });

  // Padding bottom - less when expanded, more when minimized
  const inputPaddingBottom = useTransform(minimizationFactor, (factor) => {
    // Expanded: 4px, Minimized: 10px
    return 4 + factor * 6;
  });

  const handleSubmit = async (message: ChatInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    // If currently streaming, stop the current stream first
    if (status === "streaming" || status === "submitted") {
      stop?.();
    }

    // Clear old suggestions before sending new message
    clearSuggestions();

    // Set chat ID to ensure proper URL routing
    if (chatId) {
      setChatId(chatId);
    }

    // Process attachments to base64
    let attachments: { name: string; type: string; data: string }[] = [];
    if (message.files && message.files.length > 0) {
      attachments = await Promise.all(
        message.files.map(async (file: any) => {
          return new Promise<{ name: string; type: string; data: string }>(
            (resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64String = (reader.result as string)
                  .split(",")
                  .pop();
                resolve({
                  name: file.name,
                  type: file.type,
                  data: base64String || "",
                });
              };
              reader.readAsDataURL(file);
            },
          );
        }),
      );
    }

    // Call sendChatMessage to hit our REST API
    // The useChatActions().sendMessage typically handles the AI SDK state
    // But since the user wants it with their REST API, and we have sendChatMessage,
    // we need to decide if we use sendMessage (from AI SDK) or our custom one.
    // If sendMessage is hooked to the API, we use it.
    // Looking at ai.action.ts, sendChatMessage is our direct API call.
    // However, ChatProvider/useChatActions is usually linked to a useChat-like hook.
    // For now, let's keep using the standard sendMessage but ensure it's compatible,
    // OR call our action if the store doesn't handle the API call.

    sendMessage({
      text: message.text || "Sent with attachments",
      files: message.files,
      metadata: {
        agentChoice: message.metadata?.agentChoice,
        toolChoice: message.metadata?.toolChoice,
        attachments, // We pass our processed attachments in metadata or body
      },
    });

    setInput("");
    resetCommandState();
  };

  const handleStopClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Prevent form submission when stopping
    e.preventDefault();
    e.stopPropagation();

    if (status === "streaming" || status === "submitted") {
      stop?.();
    }
  };

  return (
    <motion.div
      initial={isHome ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        "mx-auto w-full max-w-full relative",
        !isHome && "transition-all duration-300 ease-in-out",
        // isCanvasVisible ? "right-0 md:right-[603px]" : "right-0",
        isHome && "chat-input-static",
      )}
    >
      <motion.div
        ref={containerRef}
        className="mx-auto w-full max-w-full relative"
        style={{
          maxWidth: containerMaxWidth,
        }}
      >
        <ChatCommandMenu />
        <ChatHistoryDropdown />

        {/* Overlay to capture clicks when minimized */}
        {targetMinimizationFactor > 0.1 && (
          <div
            className="absolute inset-0 z-10 cursor-text"
            onClick={() => textareaRef.current?.focus()}
          />
        )}

        <motion.div
          style={{
            padding: containerPadding,
            flexDirection: containerFlexDirection,
            borderRadius: containerBorderRadius,
            backgroundColor: isFocused
              ? undefined
              : mounted && document.documentElement.classList.contains("dark")
                ? containerDarkBg
                : containerBg,
          }}
          className={cn(
            "bg-[rgba(247,247,247,0.85)]! dark:bg-[rgba(19,19,19,0.7)]! backdrop-blur-lg flex relative p-0 border border-border/50 rounded-3xl overflow-hidden transition-all shadow-none!",
            isFocused && "border-black/20 dark:border-white/20",
          )}
        >
          {/* <AudioPlayer /> */}
          <PromptInput
            onSubmit={handleSubmit}
            globalDrop
            multiple
            accept="application/pdf,image/*"
            className="bg-transparent! w-full"
          >
            <motion.div
              style={{
                gap: bodyGap,
                paddingRight: bodyPaddingRight,
                display: "flex",
                width: "100%",
                flexDirection: bodyFlexDirection,
              }}
            >
              <PromptInputBody
                className={cn(
                  targetMinimizationFactor > 0.15 && "flex-row flex-1 pr-2",
                )}
              >
                <PromptInputAttachments>
                  {(attachment) => <PromptInputAttachment data={attachment} />}
                </PromptInputAttachments>
                <motion.div
                  style={{
                    height: inputWrapperHeight,
                    paddingBottom: inputPaddingBottom,
                    overflow: "hidden",
                    boxSizing: "border-box",
                    clipPath: textClipPath,
                    opacity: textOpacity,
                  }}
                >
                  <PromptInputTextarea
                    ref={textareaRef}
                    onChange={(e) => {
                      isTypingRef.current = true;
                      handleInputChange(e);
                    }}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    className={cn(
                      "w-full h-full border-none bg-transparent resize-none outline-none whitespace-nowrap overflow-hidden text-ellipsis transition-all duration-300",
                      targetMinimizationFactor > 0.4 &&
                        !input &&
                        "text-center placeholder:text-center",
                    )}
                    onKeyDown={(e) => {
                      // Handle Enter key for commands
                      if (e.key === "Enter" && showCommands) {
                        e.preventDefault();
                        const selectedCommand =
                          filteredCommands[selectedCommandIndex];
                        if (selectedCommand) {
                          // Execute command through the store
                          if (!chatId) return;

                          // Clear old suggestions before sending new message
                          clearSuggestions();

                          setChatId(chatId);

                          sendMessage({
                            role: "user",
                            parts: [
                              { type: "text", text: selectedCommand.title },
                            ],
                            metadata: {
                              toolCall: {
                                toolName: selectedCommand.toolName,
                                toolParams: selectedCommand.toolParams,
                              },
                            },
                          });

                          setInput("");
                          resetCommandState();
                        }
                        return;
                      }

                      // Handle Enter key for normal messages - trigger form submission
                      if (e.key === "Enter" && !showCommands && !e.shiftKey) {
                        // Don't submit if IME composition is in progress
                        if (e.nativeEvent.isComposing) {
                          return;
                        }

                        e.preventDefault();
                        const form = e.currentTarget.form;
                        if (form) {
                          form.requestSubmit();
                        }
                        return;
                      }

                      // Handle other keys normally
                      handleKeyDown(e);
                    }}
                    value={input}
                    placeholder={
                      isWebSearch ? "Search the web" : "Ask anything"
                    }
                  />
                </motion.div>
              </PromptInputBody>
            </motion.div>
            <motion.div
              style={{
                maxHeight: toolbarMaxHeight,
                opacity: toolbarOpacity,
                overflow: "hidden",
              }}
            >
              <PromptInputToolbar
                className={cn(targetMinimizationFactor > 0.15 && "shrink-0")}
                onMouseDown={() => setIsInteractingWithButtons(true)}
                onMouseUp={() => {
                  // Delay to allow button click to complete
                  setTimeout(() => setIsInteractingWithButtons(false), 100);
                }}
                onFocus={() => setIsInteractingWithButtons(true)}
                onBlur={() => {
                  // Delay to allow button click to complete
                  setTimeout(() => setIsInteractingWithButtons(false), 100);
                }}
              >
                <PromptInputTools>
                  <motion.div
                    className="flex items-center gap-2"
                    style={{
                      opacity: buttonOpacity,
                      scale: buttonScale,
                      pointerEvents: buttonPointerEvents,
                    }}
                  >
                    <PromptInputActionAddAttachments />
                    <ChatSuggestionButton />
                    <ChatWebSearchButton />
                    <ChatHistoryButton />
                  </motion.div>
                </PromptInputTools>

                <PromptInputTools>
                  <motion.div
                    style={{
                      opacity: buttonOpacity,
                      scale: buttonScale,
                      pointerEvents: buttonPointerEvents,
                    }}
                  >
                    {/* <RecordButton size={16} /> */}
                  </motion.div>
                  <motion.div
                    style={{
                      opacity: buttonOpacity,
                      scale: buttonScale,
                      pointerEvents: buttonPointerEvents,
                    }}
                  >
                    <PromptInputSubmit
                      disabled={
                        // Enable button when streaming so user can stop
                        status === "streaming" || status === "submitted"
                          ? false
                          : (!input && !status) ||
                            isUploading ||
                            isRecording ||
                            isProcessing
                      }
                      status={status}
                      onClick={
                        status === "streaming" || status === "submitted"
                          ? handleStopClick
                          : undefined
                      }
                    />
                  </motion.div>
                </PromptInputTools>
              </PromptInputToolbar>
            </motion.div>
          </PromptInput>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
