import { createHmac, timingSafeEqual } from "node:crypto";

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function getPublicRequestUrl(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto) url.protocol = `${forwardedProto}:`;
  if (forwardedHost) url.host = forwardedHost;

  return url.toString();
}

export function parseFormBody(rawBody: string): Record<string, string> {
  const params = new URLSearchParams(rawBody);
  const payload: Record<string, string> = {};

  for (const [key, value] of params.entries()) {
    payload[key] = value;
  }

  return payload;
}

export function verifyTwilioSignature(options: {
  authToken: string;
  signatureHeader: string;
  url: string;
  formBody: Record<string, string>;
}): boolean {
  const { authToken, signatureHeader, url, formBody } = options;

  const sortedEntries = Object.entries(formBody).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const data = `${url}${sortedEntries.map(([k, v]) => `${k}${v}`).join("")}`;
  const expected = createHmac("sha1", authToken).update(data).digest("base64");

  return safeCompare(expected, signatureHeader);
}

export function verifyTelegramSecret(options: {
  expectedSecret: string;
  receivedSecret: string | null;
}): boolean {
  const { expectedSecret, receivedSecret } = options;
  if (!receivedSecret) return false;
  return safeCompare(expectedSecret, receivedSecret);
}
