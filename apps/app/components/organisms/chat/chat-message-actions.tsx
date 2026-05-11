"use client";

import { useRef, useState } from "react";

// import { useAudioPlayerStore } from "@/store/audio-player";
import { useChatActions, useChatId } from "@ai-sdk-tools/store";
import { useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { cn, Icons, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@workspace/ui";

interface ChatMessageActionsProps {
  messageContent: string;
  messageId?: string;
  insightId?: string;
  dictionary: Dictionary;
}

export function ChatMessageActions({ messageContent, dictionary }: ChatMessageActionsProps) {
  const chatId = useChatId();
  const { regenerate } = useChatActions();
  const [feedbackGiven, setFeedbackGiven] = useState<"positive" | "negative" | null>(null);
  const [copied, setCopied] = useState(false);

  const _queryClient = useQueryClient();
  //   const playAudio = useAudioPlayerStore((state) => state.play);
  const _audioFetchingRef = useRef(false);

  //   const createFeedbackMutation = useMutation(
  //     trpc.chatFeedback.create.mutationOptions(),
  //   );

  //   const deleteFeedbackMutation = useMutation(
  //     trpc.chatFeedback.delete.mutationOptions(),
  //   );

  const createFeedbackMutation = { isPending: false };
  const deleteFeedbackMutation = { isPending: false };

  const handleRegenerate = () => {
    regenerate?.();
  };

  const handlePositive = () => {
    if (feedbackGiven === "positive") {
      // Already gave positive feedback, remove feedback
      setFeedbackGiven(null);

      if (!chatId) return;

      //   deleteFeedbackMutation.mutate({
      //     chatId,
      //     messageId,
      //   });
      return;
    }

    setFeedbackGiven("positive");

    if (!chatId) return;

    // createFeedbackMutation.mutate({
    //   chatId,
    //   messageId,
    //   type: "positive",
    // });
  };

  const handleNegative = () => {
    if (feedbackGiven === "negative") {
      // Already gave negative feedback, remove feedback
      setFeedbackGiven(null);

      if (!chatId) return;

      //   deleteFeedbackMutation.mutate({
      //     chatId,
      //     messageId,
      //   });
      return;
    }

    setFeedbackGiven("negative");

    if (!chatId) return;

    // createFeedbackMutation.mutate({
    //   chatId,
    //   messageId,
    //   type: "negative",
    // });
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(messageContent);
      setCopied(true);
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  //   const handlePlayAudio = useCallback(async () => {
  //     if (!insightId || audioFetchingRef.current) return;

  //     audioFetchingRef.current = true;
  //     try {
  //       const result = await queryClient.fetchQuery(
  //         trpc.insights.audioUrl.queryOptions({ id: insightId }),
  //       );

  //       if (result.audioUrl) {
  //         playAudio(result.audioUrl);
  //       }
  //     } catch (error) {
  //       console.error("Failed to fetch audio URL:", error);
  //     } finally {
  //       audioFetchingRef.current = false;
  //     }
  //   }, [insightId, queryClient, trpc, playAudio]);

  return (
    <div className="flex items-center gap-1">
      {/* Listen Button - only show if there's an insight with potential audio */}
      {/* {insightId && (
        <div>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handlePlayAudio}
                  className="flex items-center justify-center w-6 h-6 transition-colors duration-200 hover:bg-muted"
                >
                  <Icons.UnMute className="size-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="px-2 py-1 text-xs">
                <p>Listen to breakdown</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )} */}

      {/* Copy Button */}
      <div>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={copyToClipboard}
                className="flex h-6 w-6 items-center justify-center transition-colors duration-200 hover:bg-muted"
              >
                {copied ? (
                  <Icons.Check className="zoom-in-50 size-3.5 animate-in duration-200" />
                ) : (
                  <Icons.Copy className="size-3 text-muted-foreground hover:text-foreground" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">
              <p>{copied ? dictionary.common.copied : dictionary.chat.actions.copy}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Retry Button */}
      <div>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleRegenerate}
                className="flex h-6 w-6 items-center justify-center transition-colors duration-200 hover:bg-muted"
              >
                <Icons.Refresh className="size-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">
              <p>{dictionary.chat.actions.retry || "Retry response"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Positive Feedback Button */}
      <div>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handlePositive}
                disabled={createFeedbackMutation.isPending || deleteFeedbackMutation.isPending}
                className={cn(
                  "flex h-6 w-6 items-center justify-center transition-colors duration-200 hover:bg-muted",
                  (createFeedbackMutation.isPending || deleteFeedbackMutation.isPending) &&
                    "cursor-not-allowed opacity-50",
                )}
              >
                <Icons.ThumbUp
                  className={cn(
                    "h-3 w-3",
                    feedbackGiven === "positive"
                      ? "fill-foreground text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">
              <p>
                {feedbackGiven === "positive"
                  ? dictionary.chat.actions.remove_positive || "Remove positive feedback"
                  : dictionary.chat.actions.positive || "Positive feedback"}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Negative Feedback Button */}
      <div>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleNegative}
                disabled={createFeedbackMutation.isPending || deleteFeedbackMutation.isPending}
                className={cn(
                  "flex h-6 w-6 items-center justify-center transition-colors duration-200 hover:bg-muted",
                  (createFeedbackMutation.isPending || deleteFeedbackMutation.isPending) &&
                    "cursor-not-allowed opacity-50",
                )}
              >
                <Icons.ThumbDown
                  className={cn(
                    "h-3 w-3",
                    feedbackGiven === "negative"
                      ? "fill-foreground text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">
              <p>
                {feedbackGiven === "negative"
                  ? dictionary.chat.actions.remove_negative || "Remove negative feedback"
                  : dictionary.chat.actions.negative || "Negative feedback"}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
