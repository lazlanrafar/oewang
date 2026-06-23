import { timingSafeEqual } from "node:crypto";

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function verifyTelegramSecret(options: {
  expectedSecret: string;
  receivedSecret: string | null;
}): boolean {
  const { expectedSecret, receivedSecret } = options;
  if (!receivedSecret) return false;
  return safeCompare(expectedSecret, receivedSecret);
}

/**
 * Verify an Evolution (WhatsApp) webhook by comparing the instance apikey that
 * Evolution sends — in the payload body and/or an `apikey` header — against our
 * configured EVOLUTION_API_TOKEN. Constant-time to avoid leaking the token.
 */
export function verifyEvolutionApiKey(options: {
  expectedToken: string;
  receivedToken: string | null | undefined;
}): boolean {
  const { expectedToken, receivedToken } = options;
  if (!receivedToken) return false;
  return safeCompare(expectedToken, receivedToken);
}
