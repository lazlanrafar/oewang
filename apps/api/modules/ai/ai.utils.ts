/**
 * AI Module Utilities
 * Pure utility functions extracted for testing
 */

/** Check if string is a valid UUID */
export const isUuid = (id: string) => /^[a-f0-9-]{36}$/i.test(id);

/** Parse input date string to Date object */
export function parseInputDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Convert Date to YYYY-MM-DD format */
export function toDateOnly(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

/** Get first day of month */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Get last day of month */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** Add one month to date, preserving day of month */
export function addMonthlyReset(base: Date): Date {
  const next = new Date(base);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

/** Convert input to valid ISO date string */
export function toValidIsoDate(input?: string): string {
  if (!input) return new Date().toISOString();
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

/** Format number as Indonesian currency */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat("id-ID").format(amount || 0);
}

/** Check if attachment is a receipt (PDF or image) */
export function isReceiptAttachment(attachment: { type: string }): boolean {
  return attachment.type === "application/pdf" || attachment.type.startsWith("image/");
}

/** Check if attachments contain receipts */
export function hasReceiptAttachments(attachments: { type: string }[] | undefined): boolean {
  return Boolean(attachments?.some(isReceiptAttachment));
}

/** Check if text indicates confirmation intent */
export function isConfirmIntent(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return /(^|\b)(confirm|confirmed|yes|ok|okay|save|simpan|ya|lanjut)(\b|$)/i.test(normalized);
}

/** Check if text indicates cancel intent */
export function isCancelIntent(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return /(^|\b)(cancel|batal|jangan|stop|abort)(\b|$)/i.test(normalized);
}

/** Extract wallet name from text */
export function extractRequestedWalletName(
  text: string,
  wallets: Array<{ name: string }>
): string | undefined {
  const explicit = text.match(/(?:account|wallet|akun)\s*[:=-]\s*([^\n]+)/i)?.[1]?.trim();
  if (explicit) return explicit;

  const normalized = text.toLowerCase();
  const byMention = wallets.find((wallet) =>
    normalized.includes(wallet.name.toLowerCase())
  );
  return byMention?.name;
}

/** Resolve wallet by name (case-insensitive) */
export function resolveWalletByName<T extends { name: string }>(
  wallets: T[],
  name: string | undefined
): T | null {
  if (!name) return null;
  const lowered = name.toLowerCase();
  return (
    wallets.find((w) => w.name.toLowerCase() === lowered) ||
    wallets.find((w) => w.name.toLowerCase().includes(lowered)) ||
    null
  );
}

/** Resolve date range from period string or custom dates */
export function resolveDateRange(
  input: {
    from?: string;
    to?: string;
    period?: string;
  } = {},
  defaultPeriod: "this-month" | "last-6-months" | "1-year" = "this-month"
): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const parsedFrom = parseInputDate(input.from);
  const parsedTo = parseInputDate(input.to);

  // Custom date range
  if (parsedFrom || parsedTo) {
    const from = parsedFrom ?? parsedTo ?? now;
    const to = parsedTo ?? now;
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    return {
      startDate: toDateOnly(start),
      endDate: toDateOnly(end),
      label: "custom-range",
    };
  }

  // Predefined periods
  const period = String(input.period || defaultPeriod).toLowerCase();
  switch (period) {
    case "this-month":
      return {
        startDate: toDateOnly(startOfMonth(now)),
        endDate: toDateOnly(now),
        label: "this-month",
      };
    case "last-month": {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        startDate: toDateOnly(startOfMonth(lastMonthDate)),
        endDate: toDateOnly(endOfMonth(lastMonthDate)),
        label: "last-month",
      };
    }
    case "last-3-months":
    case "3-months":
      return {
        startDate: toDateOnly(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
        endDate: toDateOnly(now),
        label: "last-3-months",
      };
    case "6-months":
    case "last-6-months":
      return {
        startDate: toDateOnly(new Date(now.getFullYear(), now.getMonth() - 5, 1)),
        endDate: toDateOnly(now),
        label: "last-6-months",
      };
    case "this-year":
    case "year-to-date":
      return {
        startDate: toDateOnly(new Date(now.getFullYear(), 0, 1)),
        endDate: toDateOnly(now),
        label: "this-year",
      };
    case "last-year":
      return {
        startDate: toDateOnly(new Date(now.getFullYear() - 1, 0, 1)),
        endDate: toDateOnly(new Date(now.getFullYear() - 1, 11, 31)),
        label: "last-year",
      };
    case "last-12-months":
    case "1-year":
    default:
      return {
        startDate: toDateOnly(new Date(now.getFullYear(), now.getMonth() - 11, 1)),
        endDate: toDateOnly(now),
        label: "last-12-months",
      };
  }
}
