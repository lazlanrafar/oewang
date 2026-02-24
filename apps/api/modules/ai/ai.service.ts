import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, ChatResponse } from "./ai.dto";
import { AiRepository } from "./ai.repository";

const SYSTEM_PROMPT_BASE = `You are Okane, a friendly and insightful personal finance assistant. You have access to the user's real financial data below and can answer questions about their spending, income, wallet balances, and financial health.

Be concise, helpful, and direct. Use bullet points and short paragraphs. Format numbers clearly. When the user asks about their data, reference real numbers from the context. If data is not available in the context, say so honestly.

Never make up numbers. Always use the financial context provided.`;

export abstract class AiService {
  /**
   * Build a financial context block from the database for the given workspace.
   */
  static async buildFinancialContext(workspaceId: string): Promise<string> {
    const [recentTxns, walletSummary, spending, monthlyTotals] =
      await Promise.all([
        AiRepository.getRecentTransactions(workspaceId, 20),
        AiRepository.getWalletSummary(workspaceId),
        AiRepository.getSpendingByCategory(workspaceId, 30),
        AiRepository.getMonthlyTotals(workspaceId, 3),
      ]);

    const totalBalance = walletSummary
      .filter((w) => w.isIncludedInTotals)
      .reduce((sum, w) => sum + w.balance, 0);

    const walletLines = walletSummary
      .map((w) => `  - ${w.name}: ${w.balance.toLocaleString()}`)
      .join("\n");

    const spendingLines =
      spending.length > 0
        ? spending
            .map(
              (s) =>
                `  - ${s.categoryName ?? "Uncategorized"}: ${Number(s.total).toLocaleString()} (${s.count} transactions)`,
            )
            .join("\n")
        : "  - No expense data in the last 30 days.";

    // Group monthly totals
    const monthlyMap: Record<string, { income: number; expense: number }> = {};
    for (const row of monthlyTotals) {
      if (!monthlyMap[row.month]) {
        monthlyMap[row.month] = { income: 0, expense: 0 };
      }
      if (row.type === "income") {
        monthlyMap[row.month]!.income = Number(row.total);
      } else if (row.type === "expense") {
        monthlyMap[row.month]!.expense = Number(row.total);
      }
    }
    const monthlyLines =
      Object.keys(monthlyMap).length > 0
        ? Object.entries(monthlyMap)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(
              ([month, v]) =>
                `  - ${month}: Income ${v.income.toLocaleString()} | Expense ${v.expense.toLocaleString()} | Net ${(v.income - v.expense).toLocaleString()}`,
            )
            .join("\n")
        : "  - No monthly data available yet.";

    const recentLines =
      recentTxns.length > 0
        ? recentTxns
            .slice(0, 10)
            .map(
              (t) =>
                `  - [${t.date}] ${t.name} | ${t.type} | ${Number(t.amount).toLocaleString()} | ${t.walletName ?? "?"} | ${t.categoryName ?? "Uncategorized"}`,
            )
            .join("\n")
        : "  - No recent transactions found.";

    return `
## User's Financial Context (live data)

### Wallet Balances
${walletLines || "  - No wallets found."}
Total (included in totals): ${totalBalance.toLocaleString()}

### Spending by Category (last 30 days)
${spendingLines}

### Monthly Summary (last 3 months — Income | Expense | Net)
${monthlyLines}

### Recent Transactions (latest 10)
${recentLines}
`.trim();
  }

  /**
   * Chat with Claude using the user's financial context.
   */
  static async chat(
    messages: ChatMessage[],
    workspaceId: string,
  ): Promise<ChatResponse> {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const financialContext = await AiService.buildFinancialContext(workspaceId);
    const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${financialContext}`;

    const response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    const reply = textBlock
      ? textBlock.text
      : "I couldn't generate a response. Please try again.";

    return {
      reply,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  }
}
