import { notFound } from "next/navigation";

import { getChatSession, getChatSessionMessages } from "@workspace/modules/ai/ai.action";
import type { Metadata } from "next";

import ChatInterface from "@/components/organisms/chat/chat-interface";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

type Props = {
  params: Promise<{ id: string; locale: Locale }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const response = await getChatSession(id);

  if (!response.success || !response.data) {
    return {
      title: "Chat",
    };
  }

  return {
    title: response.data.title,
  };
}

import { ChatProviderWrapper } from "@/components/organisms/chat/chat-provider-wrapper";

export default async function ChatPage(props: Props) {
  const { id, locale } = await props.params;

  const [response, dictionary] = await Promise.all([getChatSessionMessages(id), getDictionary(locale)]);

  if (!response.success || !response.data) {
    notFound();
  }

  // Map backend ChatMessage to frontend Message format if needed,
  // but initialMessages usually expects AI SDK Message type.
  // The backend ChatMessage is { role: "user" | "assistant", content: string }
  // We'll add IDs to them for the store.
  const initialMessages = response.data.map((m, i) => {
    const parts: Array<Record<string, unknown>> = [{ type: "text", text: m.content }];
    const attachment = m.attachments;
    const fileAttachments = Array.isArray(attachment) ? attachment : [];
    for (const file of fileAttachments) {
      if (!file?.data || !file?.type) continue;
      parts.push({
        type: "file",
        url: `data:${file.type};base64,${file.data}`,
        mediaType: file.type,
        filename: file.name || "attachment",
      });
    }

    // New rows store every canvas from the turn as `artifacts: [...]`; older
    // rows persisted only the last one as a singular `artifact` — read both so
    // history saved before this change still renders its one canvas.
    const attachmentObj = Array.isArray(attachment) ? attachment[0] : attachment;
    const artifacts: Array<{ type: string; payload: unknown }> =
      attachmentObj?.artifacts ?? (attachmentObj?.artifact ? [attachmentObj.artifact] : []);

    for (const artifact of artifacts) {
      parts.push({
        type: `data-artifact-${artifact.type}`,
        id: artifact.type,
        artifactType: artifact.type,
        data: {
          id: artifact.type,
          type: artifact.type,
          status: "complete",
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          payload: artifact.payload,
          progress: 1,
        },
        artifact: {
          id: artifact.type,
          type: artifact.type,
          payload: artifact.payload,
        },
      });
    }

    return {
      id: `${id}-${i}`,
      role: m.role as "user" | "assistant" | "system" | "data",
      content: m.content,
      parts,
      createdAt: new Date(),
    };
  });

  return (
    <ChatProviderWrapper initialMessages={initialMessages as any}>
      <ChatInterface dictionary={dictionary} />
    </ChatProviderWrapper>
  );
}
