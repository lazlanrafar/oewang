"use client";

import { useRouter } from "next/navigation";

import { useChatActions, useDataPart } from "@ai-sdk-tools/store";
import { useQuery } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { getChatSessions } from "@workspace/modules/ai/ai.action";
import { Button, Icons } from "@workspace/ui";
import { useChatInterface } from "@workspace/ui/hooks";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

import { useChatStore } from "@/stores/chat";

interface ChatTitleData {
  chatId: string;
  title: string;
}

export function ChatHeader({ dictionary }: { dictionary: Dictionary }) {
  const { chatId } = useChatInterface();
  const { isHome } = useChatStore();

  const router = useRouter();
  const { reset } = useChatActions();

  const [dataPartTitle] = useDataPart<ChatTitleData>("chat-title", {
    onData: (dataPart) => {
      const title = dataPart?.data?.title;
      if (title) {
        document.title = `${title} - Oewang`;
      }
    },
  });

  const { data: sessionsResponse } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => getChatSessions(),
    enabled: !!chatId && !isHome,
  });

  const sessions = sessionsResponse?.data ?? [];
  const sessionTitle = sessions.find((session) => session.id === chatId)?.title;

  const displayTitle = dataPartTitle?.title || sessionTitle;

  const handleBack = () => {
    reset();
    // Preserve tab query parameter when navigating back
    // const backPath = tab && tab !== "overview" ? `/?tab=${tab}` : "/";
    const backPath = "/overview";
    router.push(backPath);
  };

  const handleNewChat = () => {
    reset();
    router.push("/overview");
  };

  if (isHome) return null;

  return (
    <div className="relative flex h-10 items-center justify-center">
      <div className="absolute left-0">
        <Button type="button" onClick={handleBack} variant="outline" size="icon">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>
      <AnimatePresence mode="wait">
        {displayTitle && (
          <motion.div
            key={displayTitle}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="whitespace-nowrap font-medium text-foreground text-xs">{displayTitle}</div>
          </motion.div>
        )}
      </AnimatePresence>
      {!isHome && (
        <div className="absolute right-0 flex items-center gap-2">
          <Button
            type="button"
            onClick={handleNewChat}
            variant="outline"
            size="icon"
            title={dictionary.chat.new_chat || "New chat"}
          >
            <Icons.Add size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
