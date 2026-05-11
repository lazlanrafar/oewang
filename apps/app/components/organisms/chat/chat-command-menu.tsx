"use client";

import { type RefObject, useEffect, useRef } from "react";

import { useChatActions, useChatId } from "@ai-sdk-tools/store";
import { AnimatedSizeContainer, cn, Icons } from "@workspace/ui";
import { useOnClickOutside } from "usehooks-ts";

import { useChatStore } from "@/stores/chat";

export function ChatCommandMenu() {
  const commandListRef = useRef<HTMLDivElement>(null);
  const {
    filteredCommands,
    selectedCommandIndex,
    showCommands,

    resetCommandState,
    setInput,
    setShowCommands,
  } = useChatStore();

  const { sendMessage } = useChatActions();
  const _chatId = useChatId();

  // Close command menu when clicking outside (but not on the toggle button or input toolbar buttons)
  useOnClickOutside(commandListRef as RefObject<HTMLElement>, (event) => {
    if (showCommands) {
      const target = event.target as Element;
      const isToggleButton = target.closest("[data-suggested-actions-toggle]");
      // Don't close if clicking on buttons within the PromptInput toolbar
      // Check if the clicked element is a button or inside a button
      const clickedButton = target.closest("button");
      const isToolbarButton =
        clickedButton !== null &&
        (clickedButton.closest("form") !== null || clickedButton.type === "button" || clickedButton.type === "submit");

      // Only close if it's not the toggle button or toolbar buttons
      if (!isToggleButton && !isToolbarButton) {
        setShowCommands(false);
      }
    }
  });

  const handleCommandExecution = (command: Record<string, unknown>) => {
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: String(command.title) }],
      metadata: {
        toolCall: {
          toolName: String(command.toolName),
          toolParams: command.toolParams as Record<string, unknown>,
        },
      },
    });

    setInput("");
    resetCommandState();
  };

  // Scroll selected command into view
  useEffect(() => {
    if (commandListRef.current && showCommands) {
      const selectedElement = commandListRef.current.querySelector(`[data-index="${selectedCommandIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedCommandIndex, showCommands]);

  if (!showCommands || filteredCommands.length === 0) return null;

  return (
    <div ref={commandListRef} data-command-menu className="absolute right-0 bottom-full left-0 z-30 mb-2 w-full">
      <AnimatedSizeContainer
        height
        className="max-h-80 overflow-y-auto bg-[#f7f7f7]/85 backdrop-blur-lg dark:bg-[#171717]/85"
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
        <div className="p-2">
          {filteredCommands.map((command, index) => {
            const isActive = selectedCommandIndex === index;
            return (
              <button
                type="button"
                key={`${command.command}-${index}`}
                className={cn(
                  "group m-0 flex w-full cursor-pointer appearance-none items-center justify-between border-none bg-transparent px-2 py-2 text-left text-sm transition-colors",
                  isActive ? "bg-black/5 dark:bg-white/5" : "hover:bg-black/5 dark:hover:bg-white/5",
                )}
                onMouseDown={(e) => {
                  // Prevent input from losing focus when clicking on command
                  e.preventDefault();
                }}
                onClick={() => handleCommandExecution(command as Record<string, unknown>)}
                data-index={index}
              >
                <div>
                  <span className="ml-2 text-[#666]">{String(command.title)}</span>
                </div>
                {isActive && (
                  <span className="material-icons-outlined text-gray-600 text-sm opacity-50 group-hover:text-black group-hover:opacity-100 dark:text-gray-400 dark:group-hover:text-white">
                    <Icons.ArrowForward />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </AnimatedSizeContainer>
    </div>
  );
}
