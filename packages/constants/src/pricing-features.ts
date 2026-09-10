export const PRICING_FEATURES = [
  "Core Financial Tracking",
  "Advanced Analytics",
  "AI OCR Receipt Scanning",
  "Financial Reports Export (CSV / PDF)",
  "Custom Category Icons & Colors",
  "Priority Customer Service",
  "Custom Domain",
  "API Access",
  "Data Export",
  "Multi-user Support",
  "Dedicated Account Manager",
  "White-label Reports",
] as const;

export type PricingFeature = (typeof PRICING_FEATURES)[number];
