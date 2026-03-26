const currentYear = new Date().getFullYear();

const sharedMeta = {
  description:
    "Oewang is a modern financial OS for businesses. Manage spending, send invoices, track transactions, and gain real-time visibility into your finances.",
} as const;

export const APP_CONFIG = {
  name: "Oewang - Financial OS",
  version: "1.0.0",
  copyright: `© ${currentYear}, Latoe.`,
  meta: {
    title: "Oewang - Financial OS",
    ...sharedMeta,
  },
} as const;

export const WEBSITE_CONFIG = {
  name: "Oewang - Run your business finances without manual work",
  version: "1.0.0",
  copyright: `© ${currentYear}, Latoe.`,
  meta: {
    title: "Oewang – Run your business finances without manual work",
    description:
      "Oewang is the financial OS for modern businesses. AI-powered insights, automatic categorization, real-time sync. Manage spending, send invoices, track transactions.",
  },
} as const;

export const ADMIN_CONFIG = {
  name: "Oewang Admin Panel",
  version: "1.0.0",
  copyright: `© ${currentYear}, Latoe.`,
  meta: {
    title: "Oewang Admin Panel",
    ...sharedMeta,
  },
} as const;
