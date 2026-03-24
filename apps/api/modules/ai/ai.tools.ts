import { CategoriesRepository } from "../categories/categories.repository";
import { ContactsRepository } from "../contacts/contacts.repository";
import { DebtsService } from "../debts/debts.service";
import { TransactionsService } from "../transactions/transactions.service";
import { TransactionsRepository } from "../transactions/transactions.repository";
import { WalletsRepository as walletsRepository } from "../wallets/wallets.repository";
import { SettingsRepository } from "../settings/settings.repository";

// Tool definitions are now managed in @workspace/ai/tools/tool.definitions.ts

// Helper to check if string is a UUID
const isUuid = (id: string) => /^[a-f0-9-]{36}$/i.test(id);

/** Get workspace currency from settings, with USD fallback */
async function getWorkspaceCurrency(workspaceId: string): Promise<string> {
  try {
    const settings = await SettingsRepository.findByWorkspaceId(workspaceId);
    return (settings as any)?.mainCurrencyCode || "USD";
  } catch {
    return "USD";
  }
}

/** Build spending analysis payload from real transaction data */
async function buildSpendingPayload(workspaceId: string, input: any) {  
  const currency = await getWorkspaceCurrency(workspaceId);
  
  // Get current month date range
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - (input.months || 1) + 1, 1)
    .toISOString()
    .split("T")[0]!;
  const endDate = now.toISOString().split("T")[0]!;

  // Fetch expense transactions sorted by amount desc
  const { data: txList } = await TransactionsRepository.list(workspaceId, {
    page: 1,
    limit: 50,
    type: "expense",
    startDate,
    endDate,
  });

  const totalSpending = txList.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

  // Build category breakdown
  const categoryMap: Record<string, { name: string; amount: number }> = {};
  for (const tx of txList) {
    const catName = (tx as any).category?.name || "Uncategorized";
    if (!categoryMap[catName]) {
      categoryMap[catName] = { name: catName, amount: 0 };
    }
    categoryMap[catName]!.amount += Number(tx.amount || 0);
  }

  const topCategory = Object.values(categoryMap).sort((a, b) => b.amount - a.amount)[0];

  // Top 10 transactions with share
  const sortedTx = [...txList]
    .sort((a: any, b: any) => Number(b.amount) - Number(a.amount))
    .slice(0, 10);

  const transactions = sortedTx.map((tx: any) => ({
    id: tx.id,
    date: tx.date
      ? new Date(tx.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "—",
    vendor: tx.name || "Unknown",
    category: tx.category?.name || "Uncategorized",
    amount: Number(tx.amount || 0),
    share: totalSpending > 0 ? (Number(tx.amount || 0) / totalSpending) * 100 : 0,
  }));

  // Build a readable summary for the AI
  const topCats = Object.values(categoryMap)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map((c) => `${c.name} (${Math.round((c.amount / totalSpending) * 100)}%)`)
    .join(", ");

  const summary = totalSpending > 0
    ? `Your total spending for the selected period is ${currency} ${totalSpending.toFixed(2)}, spread across ${txList.length} transactions.${topCats ? `\n\nTop categories: ${topCats}.` : ""}\n\n${topCategory ? `${topCategory.name} is your largest spending category at ${currency} ${topCategory.amount.toFixed(2)}.` : ""}${transactions.length > 0 ? `\n\nThe single largest expense was ${transactions[0]!.vendor} for ${currency} ${transactions[0]!.amount.toFixed(2)}.` : ""}`
    : "No expense transactions found for the selected period.";

  return {
    stage: "analysis_ready",
    currency,
    transactions,
    metrics: {
      totalSpending,
      currentMonthSpending: totalSpending,
      topCategory: topCategory
        ? { name: topCategory.name, amount: topCategory.amount }
        : null,
    },
    analysis: { summary },
  };
}

/** Build revenue analysis payload from real transaction data */
async function buildRevenuePayload(workspaceId: string, input: any) {
  const currency = await getWorkspaceCurrency(workspaceId);

  // Fetch last 12 months of income transactions
  const now = new Date();
  const startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1)
    .toISOString()
    .split("T")[0]!;
  const endDate = now.toISOString().split("T")[0]!;

  const { data: txList } = await TransactionsRepository.list(workspaceId, {
    page: 1,
    limit: 200,
    type: "income",
    startDate,
    endDate,
  });

  // Group by month
  const monthlyMap: Record<string, number> = {};
  for (const tx of txList) {
    const d = new Date(tx.date);
    const key = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    monthlyMap[key] = (monthlyMap[key] || 0) + Number(tx.amount || 0);
  }

  const monthlyEntries = Object.entries(monthlyMap);
  const totalRevenue = monthlyEntries.reduce((s, [, v]) => s + v, 0);
  const averageMonthlyRevenue = monthlyEntries.length > 0 ? totalRevenue / monthlyEntries.length : 0;

  // Current month
  const currentMonthKey = now.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  const currentMonthRevenue = monthlyMap[currentMonthKey] || 0;

  const summary = totalRevenue > 0
    ? `Your total revenue over the last 12 months is ${currency} ${totalRevenue.toFixed(2)}.\n\nAverage monthly revenue is ${currency} ${averageMonthlyRevenue.toFixed(2)}. ${currentMonthRevenue > averageMonthlyRevenue ? "This month is trending above average." : currentMonthRevenue > 0 ? "This month is below the 12-month average." : "No income recorded this month yet."}`
    : "No income transactions found for the last 12 months.";

  return {
    stage: "analysis_ready",
    currency,
    metrics: {
      totalRevenue,
      averageMonthlyRevenue,
      currentMonthRevenue,
      revenueGrowth: 0, // Would require year-over-year comparison
    },
    analysis: { summary },
  };
}

/** Build burn rate payload from real expense data */
async function buildBurnRatePayload(workspaceId: string, input: any) {
  const currency = await getWorkspaceCurrency(workspaceId);

  // Last 6 months
  const now = new Date();
  const months: { label: string; start: string; end: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endD = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    months.push({
      label: d.toLocaleDateString("en-US", { month: "short" }),
      start: d.toISOString().split("T")[0]!,
      end: endD.toISOString().split("T")[0]!,
    });
  }

  const chart: { label: string; value: number }[] = [];
  for (const month of months) {
    const { data: txList } = await TransactionsRepository.list(workspaceId, {
      page: 1,
      limit: 200,
      type: "expense",
      startDate: month.start,
      endDate: month.end,
    });
    const total = txList.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    chart.push({ label: month.label, value: total });
  }

  const nonZero = chart.filter((c) => c.value > 0);
  const avgMonthlyBurn = nonZero.length > 0
    ? nonZero.reduce((s, c) => s + c.value, 0) / nonZero.length
    : 0;

  const summary = avgMonthlyBurn > 0
    ? `Your average monthly burn rate over the last 6 months is ${currency} ${avgMonthlyBurn.toFixed(2)}.\n\n${chart[chart.length - 1]!.value > avgMonthlyBurn ? "Last month's spending was above your average burn rate — consider reviewing discretionary expenses." : "Your burn rate is stable and within your historical average."}`
    : "No expense data found for the last 6 months.";

  return {
    stage: "analysis_ready",
    currency,
    chart,
    metrics: {
      avgMonthlyBurn,
      runway: "—", // Would need balance data to compute
    },
    analysis: { summary },
  };
}

export async function executeAiTool(
  toolName: string,
  input: any,
  workspaceId: string,
  userId: string,
): Promise<any> {
  try {
    switch (toolName) {
      case "create_transaction": {
        let walletId = input.walletId;
        let categoryId = input.categoryId;

        // Robustness: Resolve walletId from name if not a UUID
        if (walletId && !isUuid(walletId)) {
          const allWalletsResult =
            await walletsRepository.findMany(workspaceId);
          const allWallets = allWalletsResult.rows;
          const match = allWallets.find((w: any) =>
            w.name.toLowerCase().includes(walletId.toLowerCase()),
          );
          if (match) walletId = match.id;
        }

        // Robustness: Resolve categoryId from name if not a UUID
        if (categoryId && !isUuid(categoryId)) {
          const allCats = await CategoriesRepository.findMany(workspaceId);
          const match = allCats.find((c: any) =>
            c.name.toLowerCase().includes(categoryId.toLowerCase()),
          );
          if (match) categoryId = match.id;
        }

        const body = {
          type: input.type,
          amount: input.amount,
          date: input.date || new Date().toISOString(),
          name: input.name,
          walletId,
          toWalletId: input.toWalletId,
          categoryId,
          description: input.description,
        };

        const result = await TransactionsService.create(
          workspaceId,
          userId,
          body,
        );
        return { success: true, data: result.data };
      }
      case "update_transaction": {
        const { id, ...body } = input;
        const result = await TransactionsService.update(
          workspaceId,
          userId,
          id,
          body,
        );
        return { success: true, data: result.data };
      }
      case "delete_transaction": {
        const result = await TransactionsService.delete(
          workspaceId,
          userId,
          input.id,
        );
        return { success: true, data: result.data };
      }
      case "create_debt": {
        let contact = await ContactsRepository.findByName(
          workspaceId,
          input.contactName,
        );
        if (!contact) {
          contact = await ContactsRepository.create({
            workspaceId,
            name: input.contactName,
          });
        }
        if (!contact)
          return { success: false, error: "Failed to resolve contact." };

        const body = {
          contactId: contact.id,
          type: input.type,
          amount: input.amount,
          description: input.description,
          dueDate: input.dueDate,
        };

        const result = await DebtsService.createDebt(workspaceId, userId, body);
        return { success: true, data: result.data };
      }
      case "split_bill": {
        let walletId = input.walletId;
        if (walletId && !isUuid(walletId)) {
          const allWalletsResult =
            await walletsRepository.findMany(workspaceId);
          const allWallets = allWalletsResult.rows;
          const match = allWallets.find((w: any) =>
            w.name.toLowerCase().includes(walletId.toLowerCase()),
          );
          if (match) walletId = match.id;
        }

        let categoryId = input.categoryId;
        if (categoryId && !isUuid(categoryId)) {
          const allCats = await CategoriesRepository.findMany(workspaceId);
          const match = allCats.find((c: any) =>
            c.name.toLowerCase().includes(categoryId.toLowerCase()),
          );
          if (match) categoryId = match.id;
        }

        const body = {
          amount: input.amount,
          name: input.name,
          walletId,
          categoryId,
          contactNames: input.contactNames,
        };

        const result = await DebtsService.splitBill(workspaceId, userId, body);
        return { success: true, data: result.data };
      }
      case "getRevenueSummary": {
        const data = await buildRevenuePayload(workspaceId, input);
        return { success: true, data };
      }
      case "getBurnRate": {
        const data = await buildBurnRatePayload(workspaceId, input);
        return { success: true, data };
      }
      case "getSpendingAnalysis": {
        const data = await buildSpendingPayload(workspaceId, input);
        return { success: true, data };
      }
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`[AI Tool Error] ${toolName}:`, error);
    return { success: false, error: error.message || String(error) };
  }
}
