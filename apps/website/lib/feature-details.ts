export const FEATURE_DETAILS = {
  invoicing: {
    title: "Invoicing",
    subtitle: "Keep bills, invoices, and payment notes organized.",
    intro: "Track invoices and payment notes in one flow so personal, freelance, and side-income records stay clear.",
    points: [
      "Reusable invoice templates",
      "Clear due-date and status tracking",
      "Clear records for freelance or side-income payments",
      "Simple follow-up workflows for unpaid bills",
    ],
  },
  transactions: {
    title: "Transactions",
    subtitle: "All money movement in one connected timeline.",
    intro: "Track income and expenses from one place so reviews are consistent and nothing gets lost across tools.",
    points: [
      "Unified transaction feed",
      "Search and filter by category, date, and account",
      "Fast review for weekly and monthly checks",
      "Workspace-ready audit trail",
    ],
  },
  inbox: {
    title: "Inbox",
    subtitle: "Match receipts and invoices without manual hunting.",
    intro: "Collect documents from multiple channels, then map them to transactions for cleaner reconciliation.",
    points: [
      "Document capture from integrations and uploads",
      "Faster transaction attachment workflow",
      "Missing document visibility",
      "Less month-end cleanup",
    ],
  },
  customers: {
    title: "Contacts & Customers",
    subtitle: "Keep payers, billers, and recurring money relationships organized.",
    intro:
      "Connect people and organizations to transactions, invoices, debts, and notes so every money relationship has context.",
    points: [
      "Contact records for customers, vendors, lenders, and family expense partners",
      "Invoice and payment history by contact",
      "Debt and receivable context for follow-up",
      "Cleaner notes for shared household or workspace reviews",
    ],
  },
  files: {
    title: "Files",
    subtitle: "Keep finance files organized and accessible.",
    intro: "Store supporting documents where your finance operations happen, not across disconnected folders.",
    points: [
      "Central document storage",
      "Context linked to transactions and invoices",
      "Team-friendly organization",
      "Faster compliance checks",
    ],
  },
  exports: {
    title: "Exports",
    subtitle: "Deliver accountant-ready outputs with less back-and-forth.",
    intro: "Prepare structured records and supporting files so monthly export and reconciliation move faster.",
    points: [
      "Consistent category structure",
      "Attachment-ready export flow",
      "Reduced manual corrections",
      "Built for external accounting handoff",
    ],
  },
  assistant: {
    title: "Assistant",
    subtitle: "Ask daily finance questions in plain language.",
    intro: "Use AI-assisted queries to understand trends, anomalies, and next actions without digging through reports.",
    points: [
      "Natural-language finance questions",
      "Trend and anomaly summaries",
      "Action-oriented responses",
      "Built for personal and shared workspaces",
    ],
  },
} as const;

export type FeatureSlug = keyof typeof FEATURE_DETAILS;

export const FEATURE_CARDS = [
  { slug: "transactions", icon: "CreditCard" },
  { slug: "assistant", icon: "Bot" },
  { slug: "invoicing", icon: "FileText" },
  { slug: "exports", icon: "LayoutDashboard" },
  { slug: "customers", icon: "Users" },
] as const;
