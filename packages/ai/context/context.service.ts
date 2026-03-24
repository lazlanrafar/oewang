import { Intent } from "../types";
import { ContextRepository } from "./context.repository";
import { ContextFormatter } from "./context.formatter";

export abstract class ContextService {
  static async buildContextByIntent(workspaceId: string, intent: Intent): Promise<string> {
    const settings = await ContextRepository.getWorkspaceSettings(workspaceId);
    const currencyInfo = settings 
      ? `Workspace Currency: ${settings.mainCurrencyCode} (${settings.mainCurrencySymbol})\n`
      : "";

    let context = "";
    switch (intent) {
      case "transaction_query":
        const txns = await ContextRepository.getRecentTransactions(workspaceId, 10);
        context = `Recent Transactions:\n${ContextFormatter.formatTransactions(txns)}`;
        break;

      case "debt_query":
        const debts = await ContextRepository.getOutstandingDebts(workspaceId);
        context = `Outstanding Debts:\n${ContextFormatter.formatDebts(debts)}`;
        break;

      case "wallet_query":
        const wallets = await ContextRepository.getWalletSummary(workspaceId);
        context = `Wallet Balances:\n${ContextFormatter.formatWallets(wallets)}`;
        break;

      case "analytics_query":
        const spending = await ContextRepository.getSpendingByCategory(workspaceId, 30);
        context = `Monthly Spending by Category:\n${ContextFormatter.formatSpending(spending)}`;
        break;

      case "general":
      default:
        const summary = await ContextRepository.getWalletSummary(workspaceId);
        context = `Quick Summary:\n${ContextFormatter.formatWallets(summary)}`;
        break;
    }

    return `${currencyInfo}${context}`;
  }
}
