import { create } from "zustand";

interface AiChatStore {
  sendMessageFn: ((message: string) => void) | null;
  setSendMessageFn: (fn: (message: string) => void) => void;
}

export const useAiChatStore = create<AiChatStore>((set) => ({
  sendMessageFn: null,
  setSendMessageFn: (fn) => set({ sendMessageFn: fn }),
}));
