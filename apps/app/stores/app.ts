import { create } from "zustand";
import type {
  User,
  Workspace,
  TransactionSettings,
  SubCurrency,
} from "@workspace/types";
import { INCOME_EXPENSES_COLOR_OPTIONS } from "@workspace/constants";
import { formatCurrency as formatCurrencyUtil } from "@workspace/utils";
import type { Dictionary } from "@workspace/dictionaries";
import { getAiQuota, type AiQuota } from "@workspace/modules/ai/ai.action";

export interface AppState {
  user: User | null;
  workspace: Workspace | null;
  settings: TransactionSettings | null;
  subCurrencies: SubCurrency[];
  dictionary: Dictionary | null;
  isLoading: boolean;
  aiQuota: AiQuota | null;
  setUser: (user: User | null) => void;
  setWorkspace: (workspace: Workspace | null) => void;
  setSettings: (settings: TransactionSettings | null) => void;
  setSubCurrencies: (subCurrencies: SubCurrency[]) => void;
  setDictionary: (dictionary: Dictionary | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setAiQuota: (aiQuota: AiQuota | null) => void;
  fetchAiQuota: () => Promise<void>;
  getTransactionColor: (type: string) => string;
  formatCurrency: (amount: number, options?: any) => string;
  checkLimit: (
    feature: "vault_size" | "ai_tokens",
    currentUsage: number,
  ) => {
    allowed: boolean;
    limit: number;
    usage: number;
    remaining: number;
    percent: number;
  };
}

export const useAppStore = create<AppState>()((set, get) => ({
  user: null,
  workspace: null,
  settings: null,
  subCurrencies: [],
  dictionary: null,
  isLoading: true,
  aiQuota: null,
  setUser: (user) => set({ user }),
  setWorkspace: (workspace) => set({ workspace }),
  setSettings: (settings) => set({ settings }),
  setSubCurrencies: (subCurrencies) => set({ subCurrencies }),
  setDictionary: (dictionary) => set({ dictionary }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setAiQuota: (aiQuota) => set({ aiQuota }),
  fetchAiQuota: async () => {
    try {
      const result = await getAiQuota();
      if (result.success && result.data) {
        set({ aiQuota: result.data });
      }
    } catch (error) {
      console.error("Failed to fetch AI quota:", error);
    }
  },
  getTransactionColor: (type) => {
    const { settings } = get();
    const option = INCOME_EXPENSES_COLOR_OPTIONS.find(
      (o) => o.value === settings?.incomeExpensesColor,
    ) || INCOME_EXPENSES_COLOR_OPTIONS[0];

    const normalizedType = type?.toLowerCase();

    if (normalizedType === "income" || normalizedType === "transfer-in") {
      return (option?.incomeColor as string) || "text-blue-600 dark:text-blue-400";
    }

    if (normalizedType === "expense" || normalizedType === "transfer-out") {
      return (option?.expensesColor as string) || "text-red-600 dark:text-red-400";
    }

    if (normalizedType === "transfer") {
      return "text-foreground";
    }

    return "text-muted-foreground";
  },
  // Tailwind Safelist (ensure dynamic bg- classes are bundled):
  // bg-blue-600 dark:bg-blue-400 bg-red-600 dark:bg-red-400
  formatCurrency: (amount, options) => {
    const { settings } = get();
    return formatCurrencyUtil(amount, settings, options);
  },
  checkLimit: (feature, currentUsage) => {
    const { workspace, aiQuota } = get();
    const plan = workspace?.plan;

    let limit = 0;
    let actualUsage = currentUsage;

    if (feature === "vault_size") {
      limit = plan?.max_vault_size_mb || 50; // Starter fallback
      // Convert MB to bytes for comparison if currentUsage is in bytes
    } else if (feature === "ai_tokens") {
      limit = aiQuota?.maxTokens || plan?.max_ai_tokens || 50;
      actualUsage = aiQuota?.used ?? currentUsage;
    }

    const remaining = Math.max(0, limit - actualUsage);
    const percent = limit > 0 ? (actualUsage / limit) * 100 : 0;

    return {
      allowed: actualUsage < limit,
      limit,
      usage: actualUsage,
      remaining,
      percent,
    };
  },
}));
