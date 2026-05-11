import { endOfMonth, startOfMonth, startOfYear, subDays, subMonths } from "date-fns";
import { CHAT_SHORTCUT_TEMPLATES, type ShortcutDateRangePreset } from "@workspace/constants";
import { create } from "zustand";
import { getDictionaryText } from "@/modules/types/dictionary";
import { useAppStore } from "./app";

export interface CommandSuggestion {
  command: string;
  title: string;
  toolName: string;
  toolParams: Record<string, unknown>;
  keywords: string[];
}

function getDateRangeFromPreset(preset?: ShortcutDateRangePreset): { from?: string; to?: string } {
  const now = new Date();

  switch (preset) {
    case "last7Days":
      return {
        from: subDays(now, 7).toISOString(),
        to: now.toISOString(),
      };
    case "lastMonthToNow":
      return {
        from: subMonths(now, 1).toISOString(),
        to: now.toISOString(),
      };
    case "thisMonth":
      return {
        from: startOfMonth(now).toISOString(),
        to: endOfMonth(now).toISOString(),
      };
    case "yearToDate":
      return {
        from: startOfYear(now).toISOString(),
        to: endOfMonth(now).toISOString(),
      };
    default:
      return {};
  }
}

function getCommandSuggestions(): CommandSuggestion[] {
  const dictionary = useAppStore.getState().dictionary as import("@workspace/dictionaries").Dictionary | null;
  return CHAT_SHORTCUT_TEMPLATES.map((suggestion) => ({
    command: suggestion.command,
    title: getDictionaryText(dictionary, suggestion.titleKey, suggestion.titleDefault),
    toolName: suggestion.toolName,
    toolParams: {
      ...suggestion.toolParams,
      ...getDateRangeFromPreset(suggestion.dateRangePreset),
    },
    keywords: suggestion.keywords,
  }));
}

interface ChatState {
  isHome: boolean;
  setIsHome: (isHome: boolean) => void;

  // Input state
  input: string;
  setInput: (input: string) => void;
  clearInput: () => void;

  // Web search state
  isWebSearch: boolean;
  setIsWebSearch: (isWebSearch: boolean) => void;

  // Upload state
  isUploading: boolean;
  setIsUploading: (isUploading: boolean) => void;

  // Recording state
  isRecording: boolean;
  isProcessing: boolean;
  setIsRecording: (isRecording: boolean) => void;
  setIsProcessing: (isProcessing: boolean) => void;

  // Command suggestions state
  showCommands: boolean;
  setShowCommands: (showCommands: boolean) => void;
  selectedCommandIndex: number;
  setSelectedCommandIndex: (index: number) => void;
  commandQuery: string;
  setCommandQuery: (query: string) => void;
  cursorPosition: number;
  setCursorPosition: (position: number) => void;
  scrollY: number;
  setScrollY: (scrollY: number) => void;

  // Filtered commands (computed)
  filteredCommands: CommandSuggestion[];

  // Actions
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleCommandSelect: (command: CommandSuggestion) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  resetCommandState: () => void;
  navigateCommandUp: () => void;
  navigateCommandDown: () => void;
  selectCurrentCommand: () => CommandSuggestion | null;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  isHome: true,
  setIsHome: (isHome) => set({ isHome }),

  // Input state
  input: "",
  isWebSearch: false,
  isUploading: false,
  isRecording: false,
  isProcessing: false,
  showCommands: false,
  selectedCommandIndex: 0,
  commandQuery: "",
  cursorPosition: 0,
  filteredCommands: getCommandSuggestions(),
  scrollY: 0,

  // Basic setters
  setInput: (input) => set({ input }),
  clearInput: () => set({ input: "", cursorPosition: 0 }),
  setIsWebSearch: (isWebSearch) => set({ isWebSearch }),
  setIsUploading: (isUploading) => set({ isUploading }),
  setIsRecording: (isRecording) => set({ isRecording }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setShowCommands: (showCommands) =>
    set((state) => ({
      showCommands,
      filteredCommands: showCommands && !state.commandQuery ? getCommandSuggestions() : state.filteredCommands,
    })),
  setSelectedCommandIndex: (selectedCommandIndex) => set({ selectedCommandIndex }),
  setCommandQuery: (commandQuery) => set({ commandQuery }),
  setCursorPosition: (cursorPosition) => set({ cursorPosition }),
  setScrollY: (scrollY) => set({ scrollY }),

  // Input change handler
  handleInputChange: (e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;

    set({ input: value, cursorPosition: cursorPos });

    // Check if we're typing a command
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastSlashIndex = textBeforeCursor.lastIndexOf("/");

    if (lastSlashIndex !== -1) {
      const textAfterSlash = textBeforeCursor.substring(lastSlashIndex + 1);
      const suggestions = getCommandSuggestions();

      // Filter commands based on the query
      const query = textAfterSlash.toLowerCase().trim();
      const filtered = suggestions.filter((command) => {
        const matchesCommand = command.command.toLowerCase().includes(query);
        const matchesTitle = command.title.toLowerCase().includes(query);
        const matchesKeywords = command.keywords.some((keyword) => keyword.toLowerCase().includes(query));
        return matchesCommand || matchesTitle || matchesKeywords;
      });

      // Always show commands when typing after a slash, regardless of spaces
      set({
        commandQuery: textAfterSlash,
        showCommands: true,
        selectedCommandIndex: 0,
        filteredCommands: filtered,
      });
      return;
    }

    set({
      showCommands: false,
      commandQuery: "",
      filteredCommands: getCommandSuggestions(),
    });
  },

  // Command selection handler
  handleCommandSelect: (command) => {
    const { input, cursorPosition } = get();
    const textBeforeCursor = input.substring(0, cursorPosition);
    const lastSlashIndex = textBeforeCursor.lastIndexOf("/");
    const textAfterCursor = input.substring(cursorPosition);

    // Replace the command with the full suggestion
    const newText = `${textBeforeCursor.substring(0, lastSlashIndex)}${command.title} ${textAfterCursor}`;

    set({
      input: newText,
      showCommands: false,
      commandQuery: "",
    });
  },

  // Keyboard navigation handler
  handleKeyDown: (e) => {
    const { showCommands, filteredCommands, selectedCommandIndex } = get();

    if (!showCommands) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        set({
          selectedCommandIndex: Math.min(selectedCommandIndex + 1, filteredCommands.length - 1),
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        set({
          selectedCommandIndex: Math.max(selectedCommandIndex - 1, 0),
        });
        break;
      case "Enter": {
        e.preventDefault();
        const currentCommand = get().selectCurrentCommand();
        if (currentCommand) {
          get().handleCommandSelect(currentCommand);
        }
        break;
      }
      case "Escape":
        set({ showCommands: false, commandQuery: "" });
        break;
    }
  },

  // Utility functions
  resetCommandState: () => {
    set({
      showCommands: false,
      commandQuery: "",
      selectedCommandIndex: 0,
    });
  },

  navigateCommandUp: () => {
    const { selectedCommandIndex } = get();
    set({
      selectedCommandIndex: Math.max(selectedCommandIndex - 1, 0),
    });
  },

  navigateCommandDown: () => {
    const { selectedCommandIndex, filteredCommands } = get();
    set({
      selectedCommandIndex: Math.min(selectedCommandIndex + 1, filteredCommands.length - 1),
    });
  },

  selectCurrentCommand: () => {
    const { filteredCommands, selectedCommandIndex } = get();
    return filteredCommands[selectedCommandIndex] || null;
  },
}));
