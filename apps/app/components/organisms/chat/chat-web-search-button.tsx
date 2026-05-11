"use client";

import { cn, Icons } from "@workspace/ui";

import { useAppStore } from "@/stores/app";
import { useChatStore } from "@/stores/chat";
import { getDictionaryText } from "./chat-i18n";

export function ChatWebSearchButton() {
  const { isWebSearch, setIsWebSearch } = useChatStore();
  const dictionary = useAppStore((state) => state.dictionary);
  const label = getDictionaryText(dictionary, "chat.web_search_label", "Search");

  return (
    <button
      type="button"
      onClick={() => setIsWebSearch(!isWebSearch)}
      className={cn(
        "flex h-6 cursor-pointer items-center transition-colors duration-200",
        isWebSearch
          ? "rounded-full bg-[rgba(0,0,0,0.05)] pr-2 hover:bg-[rgba(0,0,0,0.08)] dark:bg-[rgba(255,255,255,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)]"
          : "hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.05)]",
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center">
        <Icons.Globle
          size={16}
          className={cn(
            "transition-colors",
            isWebSearch
              ? "text-black dark:text-white"
              : "text-[#707070] hover:text-[#999999] dark:text-[#666666] dark:hover:text-[#999999]",
          )}
        />
      </span>
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap font-medium text-[12px] text-black leading-[14px] transition-all duration-200 dark:text-white",
          isWebSearch ? "ml-0.5 max-w-[100px] opacity-100" : "ml-0 max-w-0 opacity-0",
        )}
      >
        {label}
      </span>
    </button>
  );
}
