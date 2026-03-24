"use client";

import type { ArtifactStage, ArtifactType } from "@workspace/constants";
import { getSectionFromStage } from "@workspace/constants";
import {
  extractBankAccountRequired,
  extractInsightData,
  hasInsightToolRunning,
  extractArtifactTypeFromMessage,
} from "@workspace/constants";
import type { AgentStatus } from "@workspace/types";
import { useArtifacts } from "@ai-sdk-tools/artifacts/client";
import { useDataPart } from "@ai-sdk-tools/store";
import { getStatusMessage, getToolMessage } from "@workspace/utils";
import type { ChatStatus, ToolUIPart, UIMessage } from "ai";
import { useMemo } from "react";

interface ChatStatusResult {
  agentStatus: AgentStatus | null;
  currentToolCall: string | null;
  hasTextContent: boolean;
  hasInsightData: boolean;
  artifactStage: ArtifactStage | null;
  artifactType: ArtifactType | null;
  currentSection: string | null;
  bankAccountRequired: boolean;
  statusMessage: string | null;
  toolMessage: string | null;
}

/**
 * Hook to derive chat status indicators from messages and streaming state.
 *
 * This hook manages the logic for showing agent status and tool messages:
 * - Agent status: shown when routing or executing (before content starts)
 * - Tool message: shown when a tool is actively running
 * - Hidden: when text content is streaming or chat is ready
 */
export function useChatStatus(
  messages: UIMessage[],
  status: ChatStatus,
): ChatStatusResult {
  const [agentStatusData] = useDataPart<AgentStatus>("agent-status");
  const [{ current, latestArtifactType }] = useArtifacts({
    exclude: ["chat-title", "suggestions"],
  });

  const result = useMemo(() => {
    // Extract artifact stage generically for any artifact type
    let artifactStage: ArtifactStage | null = null;
    let artifactType: ArtifactType | null = null;
    let currentSection: string | null = null;

    // Check for artifacts in the current/latest store state
    if (current?.type) {
      artifactType = current.type as ArtifactType;
      const stage = current.payload 
        ? (current.payload as { stage?: ArtifactStage })?.stage 
        : null;
      if (stage) {
        artifactStage = stage;
        currentSection = getSectionFromStage(stage);
      }
    }

    // If no active artifact found, search through message history for the latest one
    if (!artifactType && messages?.length > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const msgParts = messages[i]?.parts;
        if (msgParts) {
          const type = extractArtifactTypeFromMessage(msgParts);
          if (type) {
            artifactType = type;
            artifactStage = "analysis_ready";
            break;
          }
        }
      }
    }

    const msg =
      messages.length > 0 ? messages[messages.length - 1] : null;

    if (messages.length === 0) {
      return {
        agentStatus: agentStatusData,
        currentToolCall: null,
        hasTextContent: false,
        hasInsightData: false,
        artifactStage,
        artifactType,
        currentSection,
        bankAccountRequired: false,
        statusMessage: null,
        toolMessage: null,
      };
    }

    if (msg?.role !== "assistant") {
      return {
        agentStatus: agentStatusData,
        currentToolCall: null,
        hasTextContent: false,
        hasInsightData: false,
        artifactStage,
        artifactType,
        currentSection,
        bankAccountRequired: false,
        statusMessage: null,
        toolMessage: null,
      };
    }

    // Check if we have text content streaming
    const textParts = msg?.parts?.filter(
      (part) => part.type === "text",
    );

    const hasTextContent = textParts?.some((part) => {
      const textPart = part as { text?: string };
      return textPart.text?.trim();
    }) || false;

    // Check if we have insight data (should hide loading indicator when insight is rendering)
    const hasInsightData = extractInsightData(msg?.parts || []) !== null;

    // Check if insight tool is running (hide agent status as soon as tool starts)
    const isInsightToolActive = hasInsightToolRunning(msg?.parts || []);

    // Find active tool calls - check ALL tool-related parts
    const allParts = msg?.parts || [];

    // Check if bank account is required
    const bankAccountRequired = extractBankAccountRequired(allParts);

    const toolParts = allParts.filter((part) => {
      const type = part.type;
      return type.startsWith("tool-");
    }) as ToolUIPart[];

    let currentToolCall: string | null = null;
    let _toolMetadata: Record<string, unknown> | null = null;

    // Check if any web search is still pending (no output yet)
    const hasPendingWebSearch = toolParts.some((part) => {
      const type = part.type as string;
      const toolWithOutput = part as Record<string, unknown>;
      return type === "tool-webSearch" && !toolWithOutput.output;
    });

    // If web searches are active, prioritize showing that
    if (hasPendingWebSearch) {
      // Find the most recent web search for the query text
      for (let i = toolParts.length - 1; i >= 0; i--) {
        const tool = toolParts[i];
        const type = tool?.type as string;
        if (type === "tool-webSearch") {
          const toolWithMeta = tool as Record<string, unknown>;
          currentToolCall = "webSearch";
          _toolMetadata = toolWithMeta;
          break;
        }
      }
    } else if (toolParts.length > 0) {
      // No web searches active, get the most recent tool
      const tool = toolParts[toolParts.length - 1];
      const toolWithMeta = tool as Record<string, unknown>;
      const type = tool?.type as string;

      // Extract tool name from type (e.g., "tool-cashFlow" -> "cashFlow")
      const toolName =
        type === "dynamic-tool"
          ? (toolWithMeta.toolName as string)
          : type.replace(/^tool-/, "");

      currentToolCall = toolName;
      _toolMetadata = toolWithMeta;
    }

    // Hide tool indicator when content is streaming or complete
    if (
      currentToolCall &&
      (hasTextContent || hasInsightData || status === "ready")
    ) {
      currentToolCall = null;
      _toolMetadata = null;
    }

    // Hide agent status when content is available or tool is showing
    const agentStatus =
      status === "ready" ||
      hasTextContent ||
      hasInsightData ||
      isInsightToolActive ||
      currentToolCall ||
      bankAccountRequired
        ? null
        : agentStatusData;

    // Hide tool call when bank account is required
    const finalToolCall = bankAccountRequired ? null : currentToolCall;

    return {
      agentStatus,
      currentToolCall: finalToolCall,
      hasTextContent,
      hasInsightData,
      artifactStage,
      artifactType,
      currentSection,
      bankAccountRequired,
      statusMessage: getStatusMessage(agentStatus) ?? null,
      toolMessage: getToolMessage(finalToolCall) ?? null,
    };
  }, [messages, status, agentStatusData, current]);

  return result;
}
