import { usePathname, useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useState } from "react";

// Helper to extract chat ID from pathname with /chat/ prefix
function extractChatId(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const chatIndex = segments.indexOf("chat");

  // If "chat" segment exists and there's an ID after it
  if (chatIndex !== -1) {
    const id = segments[chatIndex + 1];
    if (id) {
      return id;
    }
  }

  return null;
}

export function useChatInterface() {
  const pathname = usePathname();
  const router = useRouter();
  const [, setSelectedType] = useQueryState("artifact-type", parseAsString);

  // Initialize state immediately from pathname to avoid blink on refresh
  const [chatId, setChatIdState] = useState<string | null>(() =>
    extractChatId(pathname),
  );

  // Clear artifact-type and reset title when navigating away from chat pages
  const handleNavigateAway = () => {
    // Only clear if we are NOT on a chat page according to the actual URL
    const currentId = extractChatId(window.location.pathname);
    if (!currentId) {
      setSelectedType(null);
      document.title = "Overview | Midday";
    }
  };

  // Extract chatId from pathname when it changes
  useEffect(() => {
    const id = extractChatId(pathname);
    
    // If we transition to Home from a Chat, clean up
    if (!id && chatId) {
      handleNavigateAway();
    }

    if (id !== chatId) {
      setChatIdState(id);
    }
  }, [pathname, chatId]);

  // Listen to popstate events for browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const id = extractChatId(window.location.pathname);
      setChatIdState(id);

      if (!id) {
        handleNavigateAway();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [setSelectedType]);

  const isHome = !chatId;
  const isChatPage = Boolean(chatId);

  const setChatId = (id: string, type?: string | null) => {
    // Preserve query parameters when updating the URL
    const locale = pathname.split("/")[1];
    
    // Create new URL search params
    const searchParams = new URLSearchParams(window.location.search);
    if (type) {
      searchParams.set("artifact-type", type);
    }
    const searchString = searchParams.toString();
    const currentSearch = searchString ? `?${searchString}` : "";

    const newPath = locale
      ? `/${locale}/chat/${id}${currentSearch}`
      : `/chat/${id}${currentSearch}`;

    // Use pushState for silent URL updates to avoid Next.js router overhead/reloads
    // during the critical Home -> Chat transition or subsequent updates.
    window.history.pushState({}, "", newPath);
    setChatIdState(id);
  };

  return {
    isHome,
    isChatPage,
    chatId,
    setChatId,
  };
}
