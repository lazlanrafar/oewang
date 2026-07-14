export const websiteEn = {
  nav: {
    overview: "Overview",
    features: "Features",
    pricing: "Pricing",
    faq: "FAQ",
    signIn: "Sign in",
    signOut: "Sign out",
  },
  hero: {
    badge: "AI finance workspace",
    titleLead: "Understand your money,",
    titleAccent: "effortlessly.",
    titleAccents: [
      "effortlessly.",
      "instantly.",
      "automatically.",
      "beautifully.",
      "together.",
    ],
    subtitle:
      "Oewang captures every transaction — snap a receipt, forward a chat, or just ask the AI — and turns daily spending into clarity across personal and team workspaces.",
    ctaStartFree: "Start free",
    ctaSeeHow: "See how it works",
    ctaGoToDashboard: "Go to dashboard",
    trialNote: "Free plan available · No credit card required",
  },
  chatDemo: {
    appName: "Oewang AI",
    status: "Online",
    receiptLabel: "receipt.jpg",
    lockTime: "9:41",
    lockDate: "Monday, 9 June",
  },
  socialProof: {
    heading: "Capture spending from anywhere you already are",
    channels: [
      "Receipt photos",
      "Telegram",
      "WhatsApp",
      "Email forwarding",
      "CSV import",
      "Multi-currency",
    ],
  },
  pillars: {
    label: "Why Oewang",
    title: "Built for the way money actually moves.",
    items: [
      {
        title: "Capture in seconds",
        description:
          "Forward a receipt or type one line. Oewang reads, categorizes, and files it automatically.",
      },
      {
        title: "Clarity, not spreadsheets",
        description:
          "Every income and expense unified, searchable, and auto-categorized — no manual columns.",
      },
      {
        title: "Ask the AI anything",
        description:
          "“How much did I spend on food this month?” Get real answers instead of digging through reports.",
      },
      {
        title: "Personal and team",
        description:
          "Switch between personal, family, and team workspaces without ever mixing records.",
      },
    ],
  },
  showcase: {
    label: "How it works",
    title: "From a receipt to a decision — in one flow.",
    subtitle:
      "Watch a single transaction move from capture to insight without touching a spreadsheet.",
    steps: [
      {
        title: "Capture",
        caption:
          "Snap or forward a receipt. AI reads the merchant, amount, and category instantly.",
      },
      {
        title: "Organize",
        caption:
          "It lands in your transactions — categorized, searchable, and multi-currency ready.",
      },
      {
        title: "Understand",
        caption:
          "Ask the assistant what changed, what’s due, and where your money actually goes.",
      },
    ],
  },
  features: {
    label: "Features",
    title: "Everything to keep daily money clear.",
    chapters: [
      {
        label: "Clarity",
        title: "All your transactions, unified.",
        description:
          "Every income and expense tracked, searched, and categorized so your daily money stays clear.",
        points: [
          "Auto-categorization with AI",
          "Search and filter instantly",
          "Multi-currency support",
          "Bulk edit transactions",
        ],
      },
      {
        label: "AI",
        title: "Ask anything about your finances.",
        description:
          "Instant answers about spending, revenue, and trends — no more digging through reports.",
        points: [
          "Natural-language queries",
          "Real-time insights",
          "Weekly summaries",
          "Multi-agent AI system",
        ],
      },
      {
        label: "Workspaces",
        title: "One account, many worlds.",
        description:
          "Switch between personal, family, and team workspaces without mixing records.",
        points: [
          "Role-based member access",
          "Isolated records per workspace",
          "Shared dashboards",
          "Multiple workspaces per account",
        ],
      },
    ],
  },
  stats: {
    label: "By the numbers",
    title: "Less admin. More clarity.",
    items: [
      { value: "2s", label: "to log a transaction from a receipt" },
      { value: "40+", label: "integrations and capture channels" },
      { value: "6", label: "currencies supported out of the box" },
      { value: "100%", label: "of your records in one workspace" },
    ],
  },
  pricing: {
    label: "Pricing",
    title: "Start free. Upgrade when you grow.",
    subtitle:
      "Every plan includes AI capture, unified transactions, and vault storage.",
    note: "Prices in USD · Billed monthly or yearly",
    // Plans and benefits are fetched live from the API; these are the shared
    // CTA labels used across every tier card.
    ctaGet: "Get started",
    ctaComingSoon: "Join the waitlist",
  },
  faq: {
    label: "FAQ",
    title: "Questions, answered.",
    items: [
      {
        q: "How does Oewang capture my transactions?",
        a: "Snap a receipt photo, forward one via Telegram or WhatsApp, import a CSV, or type a single line. Oewang’s AI reads the merchant, amount, and category and files it automatically.",
      },
      {
        q: "Is my financial data secure?",
        a: "Yes. Records are workspace-isolated, encrypted in transit and at rest, and never shared between your personal and team workspaces.",
      },
      {
        q: "Can I use it for both personal and business finances?",
        a: "That’s the point. One account holds multiple workspaces — personal, family, and team — each with its own records and role-based access.",
      },
      {
        q: "Which currencies do you support?",
        a: "Six currencies out of the box with automatic multi-currency handling, so mixed spending stays clear.",
      },
      {
        q: "Do I need a credit card to start?",
        a: "No. Start on the free Starter plan and upgrade only when you need more — no card required to begin.",
      },
    ],
  },
  cta: {
    title: "Ready to see your money clearly?",
    subtitle:
      "Capture transactions, understand spending, and stay ahead of every bill — starting today.",
    getStarted: "Get started free",
    viewPricing: "View pricing",
    trialNote: "Free plan available · No credit card required",
  },
  footer: {
    tagline: "Money clarity for real life.",
    rights: "All rights reserved.",
    product: "Product",
    company: "Company",
  },
  notFound: {
    title: "404",
    heading: "Page not found",
    description: "The page you're looking for doesn't exist or has been moved.",
    goHome: "Go home",
    goToApp: "Go to app",
  },
};

export type WebsiteDictionary = typeof websiteEn;
