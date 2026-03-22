import { Intent } from "../types";
import { ContextRepository } from "./context.repository";
import { ContextFormatter } from "./context.formatter";

export abstract class ContextService {
  static async buildContextByIntent(workspaceId: string, intent: Intent): Promise<string> {
    switch (intent) {
      case "transaction_query":
        const txns = await ContextRepository.getRecentTransactions(workspaceId, 10);
        return `Recent Transactions:\n${ContextFormatter.formatTransactions(txns)}`;

      case "debt_query":
        const debts = await ContextRepository.getOutstandingDebts(workspaceId);
        return `Outstanding Debts:\n${ContextFormatter.formatDebts(debts)}`;

      case "wallet_query":
        const wallets = await ContextRepository.getWalletSummary(workspaceId);
        return `Wallet Balances:\n${ContextFormatter.formatWallets(wallets)}`;

      case "analytics_query":
        const spending = await ContextRepository.getSpendingByCategory(workspaceId, 30);
        return `Monthly Spending by Category:\n${ContextFormatter.formatSpending(spending)}`;

      case "general":
      default:
        // For general queries, maybe provide a tiny bit of everything or nothing
        const summary = await ContextRepository.getWalletSummary(workspaceId);
        return `Quick Summary:\n${ContextFormatter.formatWallets(summary)}`;
    }
  }
}
