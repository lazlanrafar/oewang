"use client";

import {
  type ArtifactStage,
  type ArtifactType,
  getArtifactSectionMessageForStatus,
  getArtifactStageMessageForStatus,
  getArtifactTypeFromTool,
  getToolIcon,
  TOOL_TO_ARTIFACT_MAP,
} from "@workspace/constants";
import type { Dictionary } from "@workspace/dictionaries";
import type { AgentStatus } from "@workspace/types";
import { ErrorCode } from "@workspace/types";
import { AnimatedStatus } from "@workspace/ui";
import { getStatusMessage, getToolMessage } from "@workspace/utils";
import { format } from "date-fns";
import { getDictionaryText } from "./chat-i18n";

interface ChatStatusIndicatorsProps {
  agentStatus: AgentStatus | null;
  currentToolCall: string | null;
  status?: string;
  error?: { code?: string; meta?: { reset_at?: string } };
  artifactStage?: ArtifactStage | null;
  artifactType?: ArtifactType | null;
  currentSection?: string | null;
  bankAccountRequired?: boolean;
  hasTextContent?: boolean;
  hasInsightData?: boolean;
  dictionary: Dictionary;
}

export function ChatStatusIndicators({
  agentStatus,
  currentToolCall,
  status,
  error,
  artifactStage,
  artifactType,
  currentSection,
  bankAccountRequired = false,
  hasTextContent = false,
  hasInsightData = false,
  dictionary,
}: ChatStatusIndicatorsProps) {
  // Don't show status indicators when bank account is required or when insight data is being displayed
  if (bankAccountRequired || hasInsightData) {
    return null;
  }

  if (status === "error") {
    let errorMessage = getDictionaryText(
      dictionary as Record<string, unknown>,
      "chat.status.send_failed",
      "Message failed to send. Please try again.",
    );

    if (error?.code === ErrorCode.PLAN_LIMIT_REACHED) {
      const resetAt = error.meta?.reset_at;
      const formattedDate = resetAt
        ? format(new Date(resetAt), "PPP")
        : getDictionaryText(dictionary as Record<string, unknown>, "chat.status.next_month", "next month");
      errorMessage = getDictionaryText(
        dictionary as Record<string, unknown>,
        "chat.status.ai_limit_reset",
        "AI limit reached. Resets on {date}.",
        { date: formattedDate },
      );
    }

    return (
      <div className="flex h-8 items-center gap-2 text-destructive">
        <span className="font-normal text-xs">{errorMessage}</span>
      </div>
    );
  }

  const statusMessage = getStatusMessage(agentStatus);
  const toolMessage = getToolMessage(currentToolCall);

  // Determine artifact type from tool name or use provided artifact type
  const resolvedArtifactType = artifactType || getArtifactTypeFromTool(currentToolCall);
  const isStreaming = status === "streaming" || status === "submitted";

  // Show artifact status when:
  // 1. Tool is actively running and maps to an artifact, OR
  // 2. Artifact exists and is still being built (not complete or still streaming)
  // BUT NOT when text content is already streaming
  const shouldShowArtifactStatus =
    !hasTextContent &&
    resolvedArtifactType &&
    artifactStage &&
    (currentToolCall || (artifactStage !== "analysis_ready" && isStreaming));

  let displayMessage: string | null = null;
  if (shouldShowArtifactStatus) {
    // Show section message if available, otherwise show stage message
    displayMessage =
      getArtifactSectionMessageForStatus(resolvedArtifactType, currentSection ?? null) ||
      getArtifactStageMessageForStatus(resolvedArtifactType, artifactStage);
  } else {
    // Default behavior: prioritize tool message over agent status
    displayMessage = toolMessage || statusMessage;

    // Default to "Thinking..." if we're working but have no message yet
    if (!displayMessage && isStreaming && !hasTextContent && !hasInsightData) {
      displayMessage = getDictionaryText(dictionary as Record<string, unknown>, "chat.status.thinking", "Thinking...");
    }
  }

  // Get icon for current tool - show icon when tool is running or when showing artifact status
  // Find the tool name that maps to the artifact type for icon display
  const getToolNameForArtifact = (type: ArtifactType | null): string | null => {
    if (!type) return null;
    const toolEntry = Object.entries(TOOL_TO_ARTIFACT_MAP).find(([, artifactType]) => artifactType === type);
    return toolEntry ? toolEntry[0] : null;
  };

  const toolIcon = currentToolCall
    ? getToolIcon(currentToolCall)
    : displayMessage && artifactStage && artifactStage !== "analysis_ready" && resolvedArtifactType
      ? getToolIcon(getToolNameForArtifact(resolvedArtifactType) || "")
      : null;

  if (!displayMessage) {
    return null;
  }

  return (
    <div className="flex h-8 items-center gap-2">
      <AnimatedStatus
        text={displayMessage ?? null}
        shimmerDuration={0.75}
        fadeDuration={0.1}
        variant="slide"
        className="font-normal text-xs"
        icon={toolIcon}
      />
    </div>
  );
}
