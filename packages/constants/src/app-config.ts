const currentYear = new Date().getFullYear();

const sharedMeta = {
  description:
    "Oewang is a daily personal finance tracker for Indonesia. Input transactions, manage wallets, organize receipts, and understand spending with AI-assisted insights.",
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

const getWebsiteUrl = () => {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_WEBSITE_URL) {
    return process.env.NEXT_PUBLIC_WEBSITE_URL;
  }
  return "https://oewang.com";
};

const websiteUrl = getWebsiteUrl();

export const WEBSITE_CONFIG = {
  name: "Oewang - Track daily money without spreadsheets",
  url: websiteUrl,
  logo: `${websiteUrl}/logo.png`,
  version: "1.0.0",
  copyright: `© ${currentYear}, Latoe.`,
  meta: {
    title: "Oewang – Track daily money without spreadsheets",
    description:
      "Oewang helps people in Indonesia input daily transactions, track spending, manage wallets, and organize receipts with AI-assisted categorization.",
    og: {
      type: "website",
      locale: "en_US",
      url: websiteUrl,
      siteName: "Oewang",
      images: [
        {
          url: `${websiteUrl}/og-image.png`,
          width: 1200,
          height: 630,
          alt: "Oewang - Daily Personal Finance Tracker",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: "@oewang",
      creator: "@oewang",
      images: [`${websiteUrl}/og-image.png`],
    },
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
