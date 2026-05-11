export const FEATURE_DETAILS = {
  invoicing: {
    title: "Invoicing",
    subtitle: "Get paid faster with cleaner invoice operations.",
    intro:
      "Create, send, and track invoices in one flow. Keep payment status visible for both solo operators and team workspaces.",
    points: [
      "Reusable invoice templates",
      "Clear due-date and status tracking",
      "Shared visibility for finance collaborators",
      "Simple follow-up workflows for unpaid invoices",
    ],
  },
  transactions: {
    title: "Transactions",
    subtitle: "All money movement in one connected timeline.",
    intro:
      "Track income and expenses from one place so reviews are consistent and nothing gets lost across tools.",
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
    intro:
      "Collect documents from multiple channels, then map them to transactions for cleaner reconciliation.",
    points: [
      "Document capture from integrations and uploads",
      "Faster transaction attachment workflow",
      "Missing document visibility",
      "Less month-end cleanup",
    ],
  },
  "time-tracking": {
    title: "Time Tracking",
    subtitle: "Measure billable time and operational effort clearly.",
    intro:
      "Capture work time in the same finance workspace so project effort and revenue decisions stay aligned.",
    points: [
      "Session-based tracking",
      "Project and client association",
      "Better billing preparation",
      "Team-level time visibility",
    ],
  },
  customers: {
    title: "Customers",
    subtitle: "Understand who drives revenue and who delays payment.",
    intro:
      "Customer-level performance data helps prioritize follow-up and improve cash planning.",
    points: [
      "Invoice and payment history by customer",
      "Outstanding balance visibility",
      "Revenue concentration context",
      "Cleaner handoff across teams",
    ],
  },
  files: {
    title: "Files",
    subtitle: "Keep finance files organized and accessible.",
    intro:
      "Store supporting documents where your finance operations happen, not across disconnected folders.",
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
    intro:
      "Prepare structured records and supporting files so monthly export and reconciliation move faster.",
    points: [
      "Consistent category structure",
      "Attachment-ready export flow",
      "Reduced manual corrections",
      "Built for external accounting handoff",
    ],
  },
  assistant: {
    title: "Assistant",
    subtitle: "Ask business finance questions in plain language.",
    intro:
      "Use AI-assisted queries to understand trends, anomalies, and next actions without digging through reports.",
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
