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

export interface AppState {
  user: User | null;
  workspace: Workspace | null;
  settings: TransactionSettings | null;
  subCurrencies: SubCurrency[];
  dictionary: Dictionary | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setWorkspace: (workspace: Workspace | null) => void;
  setSettings: (settings: TransactionSettings | null) => void;
  setSubCurrencies: (subCurrencies: SubCurrency[]) => void;
  setDictionary: (dictionary: Dictionary | null) => void;
  setIsLoading: (isLoading: boolean) => void;
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
  setUser: (user) => set({ user }),
  setWorkspace: (workspace) => set({ workspace }),
  setSettings: (settings) => set({ settings }),
  setSubCurrencies: (subCurrencies) => set({ subCurrencies }),
  setDictionary: (dictionary) => set({ dictionary }),
  setIsLoading: (isLoading) => set({ isLoading }),
  getTransactionColor: (type) => {
    const { settings } = get();
    const option = INCOME_EXPENSES_COLOR_OPTIONS.find(
      (o) => o.value === settings?.incomeExpensesColor,
    );

    if (type === "income") {
      return option?.incomeColor as string;
    }

    if (type === "expense") {
      return option?.expensesColor as string;
    }

    if (type === "transfer") {
      return "text-foreground";
    }

    return "text-muted-foreground";
  },
  formatCurrency: (amount, options) => {
    const { settings } = get();
    return formatCurrencyUtil(amount, settings, options);
  },
  checkLimit: (feature, currentUsage) => {
    const { workspace } = get();
    const plan = workspace?.plan;

    let limit = 0;
    if (feature === "vault_size") {
      limit = plan?.max_vault_size_mb || 0;
    } else if (feature === "ai_tokens") {
      limit = plan?.max_ai_tokens || 0;
    }

    const remaining = Math.max(0, limit - currentUsage);
    const percent = limit > 0 ? (currentUsage / limit) * 100 : 0;

    return {
      allowed: currentUsage < limit,
      limit,
      usage: currentUsage,
      remaining,
      percent,
    };
  },
}));
