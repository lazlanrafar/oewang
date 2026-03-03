const currentYear = new Date().getFullYear();

const sharedMeta = {
  description:
    "Okane is a modern, privacy-first personal finance tracker built to help you take control of your wealth. Manage your budgets, track your expenses, and achieve your financial goals with ease.",
} as const;

export const APP_CONFIG = {
  name: "Okane - Money Manager",
  version: "1.0.0",
  copyright: `© ${currentYear}, Okane - Money Manager.`,
  meta: {
    title: "Okane - Money Manager",
    ...sharedMeta,
  },
} as const;

export const WEBSITE_CONFIG = {
  name: "Okane - Financial intelligence for modern business",
  version: "1.0.0",
  copyright: `© ${currentYear}, Okane.`,
  meta: {
    title: "Okane – Financial intelligence for modern business",
    description:
      "Okane is the operating system for your business. Manage spending, send invoices, and gain real-time visibility into your finances.",
  },
} as const;

export const ADMIN_CONFIG = {
  name: "Okane Admin Panel",
  version: "1.0.0",
  copyright: `© ${currentYear}, Okane Admin Panel.`,
  meta: {
    title: "Okane Admin Panel",
    ...sharedMeta,
  },
} as const;
