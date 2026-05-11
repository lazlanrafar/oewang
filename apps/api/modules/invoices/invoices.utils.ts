import * as jose from "jose";
import { Env } from "@workspace/constants";

const INVOICE_SECRET = () => new TextEncoder().encode(Env.JWT_SECRET!);
const INVOICE_TOKEN_EXPIRY = "30d";

export async function generateInvoiceToken(invoiceId: string, workspaceId: string): Promise<string> {
  const jwt = await new jose.SignJWT({ id: invoiceId, workspaceId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(INVOICE_TOKEN_EXPIRY)
    .sign(INVOICE_SECRET());
  return jwt;
}

export async function verifyInvoiceToken(token: string): Promise<{ id: string; workspaceId: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, INVOICE_SECRET());
    return { id: payload.id as string, workspaceId: payload.workspaceId as string };
  } catch {
    return null;
  }
}
