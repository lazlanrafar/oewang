"use client";

import { useChatStore } from "@/stores/chat";
import { useChatInterface } from "@workspace/ui/hooks";
import { useRouter } from "next/navigation";
import { useChatActions, useDataPart } from "@ai-sdk-tools/store";
import { Button, Icons } from "@workspace/ui";
import { ArrowLeft } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { getChatSessions } from "@workspace/modules/ai/ai.action";

interface ChatTitleData {
  chatId: string;
  title: string;
}

export function ChatHeader() {
  const { chatId } = useChatInterface();
  const { isHome } = useChatStore();

  const router = useRouter();
  const { reset } = useChatActions();

  const [dataPartTitle] = useDataPart<ChatTitleData>("chat-title", {
    onData: (dataPart) => {
      if (dataPart.data.title) {
        document.title = `${dataPart.data.title} - Okane`;
      }
    },
  });

  const { data: sessionsResponse } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => getChatSessions(),
    enabled: !!chatId && !isHome,
  });

  const sessions = (sessionsResponse?.data as any[]) || [];
  const sessionTitle = sessions.find((s) => s.id === chatId)?.title;

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
    <div className="flex items-center justify-center relative h-10">
      <div className="absolute left-0">
        <Button
          type="button"
          onClick={handleBack}
          variant="outline"
          size="icon"
        >
          <ArrowLeft className="w-4 h-4" />
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
            <div className="text-xs font-medium text-foreground whitespace-nowrap">
              {displayTitle}
            </div>
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
            title="New chat"
          >
            <Icons.Add size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
