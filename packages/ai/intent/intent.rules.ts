import { Intent } from "../types";

export function detectIntentByRules(text: string): Intent {
  const t = text.toLowerCase();

  // Search for specific keywords to determine intent
  if (t.includes("debt") || t.includes("hutang") || t.includes("piutang") || t.includes("pinjam")) return "debt_query";
  if (t.includes("last") || t.includes("transaction") || t.includes("transaksi") || t.includes("riwayat") || t.includes("history")) return "transaction_query";
  if (t.includes("balance") || t.includes("wallet") || t.includes("dompet") || t.includes("saldo") || t.includes("akun") || t.includes("account")) return "wallet_query";
  if (
    t.includes("spending") || t.includes("pengeluaran") ||
    t.includes("belanja") || t.includes("expense") || t.includes("expenses") ||
    t.includes("income") || t.includes("pemasukan") || t.includes("pendapatan") || t.includes("revenue") ||
    t.includes("burn rate") || t.includes("burn-rate") ||
    t.includes("analytics") || t.includes("analysis") || t.includes("analisis") ||
    t.includes("statistik") || t.includes("stat") ||
    t.includes("chart") || t.includes("grafik") || t.includes("diagram") ||
    t.includes("laporan") || t.includes("report") || t.includes("ringkasan") || t.includes("summary") ||
    t.includes("keuangan") || t.includes("financial") || t.includes("overview") ||
    t.includes("berapa banyak") || t.includes("how much did i spend")
  ) return "analytics_query";
  if (t.includes("split") || t.includes("patungan") || t.includes("bagi bill")) return "split_bill";
  
  // Specific creation intents (usually detected by LLM, but we can catch some here)
  if (t.includes("record") || t.includes("add") || t.includes("catat") || t.includes("tambah")) {
      if (t.includes("debt") || t.includes("hutang")) return "create_debt";
      return "create_transaction";
  }

  return "general";
}

