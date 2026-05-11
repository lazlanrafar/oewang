const FALLBACK_INTEGRATIONS = [
  {
    id: "gmail",
    slug: "gmail",
    name: "Gmail",
    category: "Email",
    status: "available",
    description:
      "Automatically capture receipts and invoices from your Gmail inbox.",
    longDescription:
      "The Gmail integration scans incoming financial emails, extracts documents, and links them to transactions so your records stay complete without manual uploads.",
    features: [
      "Auto-detect receipts and invoices",
      "Extract PDF data for faster bookkeeping",
      "Match email documents to transactions",
      "Reduce manual finance admin",
    ],
    setupSteps: [
      "Open integration settings and choose Gmail.",
      "Authenticate with Google OAuth.",
      "Select the inbox account to monitor.",
      "Review synced receipts in your workspace.",
    ],
  },
  {
    id: "outlook",
    slug: "outlook",
    name: "Outlook",
    category: "Email",
    status: "available",
    description:
      "Capture receipts and invoices from Outlook and sync them to your workspace.",
    longDescription:
      "Outlook integration keeps incoming financial documents organized in Oewang so teams can review and reconcile transactions from one place.",
    features: [
      "Inbox scanning for finance docs",
      "Automatic attachment parsing",
      "Centralized document tracking",
      "Shared access for team workspaces",
    ],
    setupSteps: [
      "Select Outlook from integrations.",
      "Connect your Microsoft account.",
      "Grant mailbox read permission.",
      "Confirm syncing status in dashboard.",
    ],
  },
  {
    id: "quickbooks",
    slug: "quickbooks",
    name: "QuickBooks",
    category: "Accounting",
    status: "coming-soon",
    description:
      "Keep bookkeeping flows aligned between Oewang and QuickBooks.",
    longDescription:
      "QuickBooks integration helps growing teams align transaction records and reporting workflows across finance tools.",
    features: [
      "Shared chart mapping",
      "Transaction export workflows",
      "Cleaner month-end process",
      "Less duplicate data entry",
    ],
    setupSteps: [
      "Available soon.",
      "We will provide a guided setup once released.",
    ],
  },
  {
    id: "xero",
    slug: "xero",
    name: "Xero",
    category: "Accounting",
    status: "coming-soon",
    description:
      "Connect Xero to streamline reporting and reconciliation.",
    longDescription:
      "Xero integration is designed for teams that need cleaner accounting handoff and centralized transaction context.",
    features: [
      "Export-ready records",
      "Workspace-aware finance context",
      "Faster reconciliation prep",
      "Role-based collaboration support",
    ],
    setupSteps: [
      "Available soon.",
      "Setup steps will be published at launch.",
    ],
  },
  {
    id: "telegram",
    slug: "telegram",
    name: "Telegram",
    category: "Messaging",
    status: "available",
    description:
      "Send receipts via Telegram and keep records synced in real-time.",
    longDescription:
      "Telegram integration allows fast receipt capture and AI-assisted finance interactions directly from chat.",
    features: [
      "Instant receipt forwarding",
      "Chat-based finance actions",
      "Quick mobile capture",
      "Shared workspace visibility",
    ],
    setupSteps: [
      "Open Telegram and find @OewangBot.",
      "Start chat and connect workspace.",
      "Verify your account using provided flow.",
      "Forward receipts to start syncing.",
    ],
  },
  {
    id: "whatsapp",
    slug: "whatsapp",
    name: "WhatsApp",
    category: "Messaging",
    status: "available",
    description:
      "Capture finance documents from WhatsApp conversations.",
    longDescription:
      "WhatsApp integration helps teams and founders send receipts on the go and keep transaction evidence attached.",
    features: [
      "Mobile-first receipt capture",
      "Document-to-transaction linking",
      "Faster approval workflows",
      "Less manual upload overhead",
    ],
    setupSteps: [
      "Connect WhatsApp number in integrations.",
      "Verify your number.",
      "Forward receipt images or PDFs.",
      "Review processed documents in Oewang.",
    ],
  },
  {
    id: "google-drive",
    slug: "google-drive",
    name: "Google Drive",
    category: "Storage",
    status: "coming-soon",
    description:
      "Store and sync finance documents with Drive.",
    longDescription:
      "Google Drive integration helps centralize financial documents while keeping audit trails and workspace context.",
    features: [
      "Document backup and sync",
      "Shared team access",
      "Cleaner file organization",
      "Linked evidence for transactions",
    ],
    setupSteps: ["Available soon."],
  },
  {
    id: "dropbox",
    slug: "dropbox",
    name: "Dropbox",
    category: "Storage",
    status: "coming-soon",
    description: "Sync invoices and receipts from Dropbox folders.",
    longDescription:
      "Dropbox integration supports finance teams that rely on file-based workflows and need cleaner organization.",
    features: [
      "Folder-based sync",
      "Document tracking",
      "Attachment linking",
      "Reduced admin work",
    ],
    setupSteps: ["Available soon."],
  },
];

type IntegrationItem = (typeof FALLBACK_INTEGRATIONS)[number];
export type PublicIntegration = IntegrationItem;

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

function normalizeFromApi(item: any): IntegrationItem {
  const name = item?.name ?? item?.id ?? "Integration";
  const slug = item?.slug ?? slugify(String(name));

  return {
    id: item?.id ?? slug,
    slug,
    name,
    category: item?.category ?? "General",
    status: item?.active ? "available" : "coming-soon",
    description:
      item?.short_description ??
      item?.description ??
      "Connect this integration with your Oewang workspace.",
    longDescription:
      item?.description ??
      item?.short_description ??
      "Integration details are managed from your workspace settings.",
    features: Array.isArray(item?.features) && item.features.length > 0
      ? item.features
      : [
          "Connect in minutes",
          "Workspace-ready access",
          "Supports team collaboration",
          "Designed for finance workflows",
        ],
    setupSteps: Array.isArray(item?.setupSteps) && item.setupSteps.length > 0
      ? item.setupSteps
      : [
          "Open integrations in Oewang.",
          "Connect and authorize provider access.",
          "Review synced data in your workspace.",
        ],
  };
}

export async function getPublicIntegrations(): Promise<PublicIntegration[]> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

  try {
    const res = await fetch(`${apiBase}/v1/public/integrations`, {
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      return FALLBACK_INTEGRATIONS;
    }

    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data.map(normalizeFromApi) : [];

    if (list.length === 0) {
      return FALLBACK_INTEGRATIONS;
    }

    const merged = list.map((entry: IntegrationItem) => {
      const fallback = FALLBACK_INTEGRATIONS.find((x) => x.slug === entry.slug || x.id === entry.id);
      return fallback
        ? {
            ...fallback,
            ...entry,
            longDescription: fallback.longDescription,
            features: fallback.features,
            setupSteps: fallback.setupSteps,
          }
        : entry;
    });

    return merged;
  } catch {
    return FALLBACK_INTEGRATIONS;
  }
}

export async function getPublicIntegrationBySlug(
  slug: string,
): Promise<PublicIntegration | null> {
  const integrations = await getPublicIntegrations();
  return integrations.find((item: IntegrationItem) => item.slug === slug) ?? null;
}
