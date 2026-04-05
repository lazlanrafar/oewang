/**
 * API Development Config
 *
 * These flags are only active in development (NODE_ENV !== "production").
 * Toggle them freely during local development — they have zero effect in production.
 */

function isDev() {
  return process.env.NODE_ENV !== "production";
}

/** ─────────────────────────────────────────────────
 *  Toggle individual flags here for local development
 *  ───────────────────────────────────────────────── */
const DEV_FLAGS = {
  /**
   * DRY-RUN MODE — Receipt / Chat parsing
   *
   * When true, AI tool calls for `create_transaction` and `add_transaction_items`
   * will NOT write anything to the database. Instead the tool returns the full
   * resolved payload back to the AI, which echoes it in the chat.
   *
   * Great for testing Telegram receipt uploads and inspecting what the AI
   * would have saved without polluting real data.
   */
  receiptDryRun: true,

  /**
   * VERBOSE TOOL LOGGING
   *
   * When true, every AI tool call logs its full input + output to the console.
   * Helps debug multi-step receipt flows (parseReceipt → create_transaction → add_transaction_items).
   */
  verboseToolLogs: true,

  /**
   * MOCK AI QUOTA
   *
   * When true, AI quota/token-limit checks are bypassed entirely.
   * Prevents "quota exceeded" errors mid-test during heavy development.
   */
  mockAiQuota: true,
} as const;

/** ─────────────────────────────────────────────────
 *  Exported config — all flags collapse to false in production
 *  ───────────────────────────────────────────────── */
export const API_CONFIG = {
  receiptDryRun: isDev() && DEV_FLAGS.receiptDryRun,
  verboseToolLogs: isDev() && DEV_FLAGS.verboseToolLogs,
  mockAiQuota: isDev() && DEV_FLAGS.mockAiQuota,
} as const;

export type ApiConfig = typeof API_CONFIG;
