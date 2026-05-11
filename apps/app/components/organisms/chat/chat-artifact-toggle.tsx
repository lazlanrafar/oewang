"use client";

import { useCallback } from "react";

import { useArtifacts } from "@ai-sdk-tools/artifacts/client";
import type { ArtifactType } from "@workspace/constants";
import type { Dictionary } from "@workspace/dictionaries";
import { Icons, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@workspace/ui";
import { parseAsString, useQueryState } from "nuqs";

interface ChatArtifactToggleProps {
  artifactType: ArtifactType;
  dictionary: Dictionary;
}

export function ChatArtifactToggle({ artifactType, dictionary }: ChatArtifactToggleProps) {
  const [selectedType, setSelectedType] = useQueryState("artifact-type", parseAsString);

  const [data, actions] = useArtifacts({
    value: selectedType ?? undefined,
    onChange: (v: string | null) => setSelectedType(v ?? null),
    exclude: ["chat-title", "suggestions"],
  });

  const { available, activeType } = data;
  const isArtifactAvailable = available.includes(artifactType);
  const isCurrentlyOpen = activeType === artifactType || selectedType === artifactType;

  const handleToggle = useCallback(() => {
    if (isCurrentlyOpen) {
      // If this artifact is currently open, close it
      actions.setValue(null);
      setSelectedType(null);
    } else {
      // Otherwise, open this artifact
      actions.setValue(artifactType);
      setSelectedType(artifactType);
    }
  }, [isCurrentlyOpen, artifactType, setSelectedType, actions]);

  // Don't render if artifact is not available
  if (!isArtifactAvailable) {
    return null;
  }

  return (
    <div>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleToggle}
              className="flex h-6 w-6 items-center justify-center transition-colors duration-200 hover:bg-muted"
              aria-label={
                isCurrentlyOpen
                  ? dictionary.chat.actions.close_artifact || "Close artifact"
                  : dictionary.chat.actions.open_artifact || "Open artifact"
              }
            >
              <Icons.Sidebar className="size-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="px-2 py-1 text-xs">
            <p>
              {isCurrentlyOpen
                ? dictionary.chat.actions.close_artifact || "Close artifact"
                : dictionary.chat.actions.open_artifact || "Open artifact"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
