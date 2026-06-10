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
