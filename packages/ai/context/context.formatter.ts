export abstract class ContextFormatter {
  static formatTransactions(txns: any[]) {
    if (txns.length === 0) return "No recent transactions found.";
    return txns
      .map(
        (t) =>
          `- ${t.date}: ${t.type.toUpperCase()} ${t.amount} | ${t.name} (${t.categoryName || "Uncategorized"}) via ${t.walletName}`,
      )
      .join("\n");
  }

  static formatWallets(wallets: any[]) {
    if (wallets.length === 0) return "No wallets found.";
    return wallets
      .map((w) => `- ${w.name}: ${Number(w.balance).toLocaleString()}`)
      .join("\n");
  }

  static formatDebts(debts: any[]) {
    if (debts.length === 0) return "No outstanding debts.";
    return debts
      .map(
        (d) =>
          `- ${d.contactName}: ${d.type === "payable" ? "You owe" : "Owes you"} ${Number(d.remainingAmount).toLocaleString()}${d.dueDate ? ` (Due: ${d.dueDate})` : ""}`,
      )
      .join("\n");
  }

  static formatSpending(spending: any[]) {
    if (spending.length === 0) return "No spending data for this period.";
    return spending
      .map((s) => `- ${s.categoryName}: ${Number(s.total).toLocaleString()}`)
      .join("\n");
  }
}
