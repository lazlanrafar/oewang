import { Env } from "@workspace/constants";
import { decrypt, encrypt } from "@workspace/encryption";

/**
 * At-rest encryption for stored secrets — integration OAuth tokens, workspace
 * API keys, vault credentials. Uses DATA_ENCRYPTION_KEY, a SERVER-ONLY key that
 * is never shipped to any client, unlike ENCRYPTION_KEY (bundled into the web +
 * native clients for transport). Shipping the transport key exposed at-rest
 * secrets; this splits the two trust domains.
 *
 * Migration: when DATA_ENCRYPTION_KEY is unset we fall back to ENCRYPTION_KEY so
 * existing deployments keep working. decryptAtRest also retries with
 * ENCRYPTION_KEY so data written before the split still decrypts. New writes use
 * the data key; rotate fully by setting a distinct DATA_ENCRYPTION_KEY and
 * re-encrypting stored rows.
 */
function dataKey(): string {
  const key = Env.DATA_ENCRYPTION_KEY || Env.ENCRYPTION_KEY;
  if (!key) throw new Error("No at-rest encryption key configured");
  return key;
}

export function encryptAtRest(plaintext: string): string {
  return encrypt(plaintext, dataKey());
}

export function decryptAtRest(ciphertext: string): string {
  const primary = dataKey();
  try {
    return decrypt(ciphertext, primary);
  } catch (err) {
    // Legacy rows encrypted with the transport key before the split.
    const legacy = Env.ENCRYPTION_KEY;
    if (legacy && legacy !== primary) {
      return decrypt(ciphertext, legacy);
    }
    throw err;
  }
}
