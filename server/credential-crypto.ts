import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const MIN_KEY_LENGTH = 32;

export function assertIntegrationEncryptionKey() {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!secret) throw new Error("INTEGRATION_ENCRYPTION_KEY is required and must be separate from JWT_SECRET");
  if (secret.length < MIN_KEY_LENGTH) throw new Error(`INTEGRATION_ENCRYPTION_KEY must be at least ${MIN_KEY_LENGTH} characters`);
  return secret;
}

function encryptionKey() {
  return createHash("sha256").update(assertIntegrationEncryptionKey()).digest();
}

export function encryptCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptCredential(payload: string) {
  const [version, ivText, tagText, encryptedText] = payload.split(".");
  if (version !== VERSION || !ivText || !tagText || !encryptedText) throw new Error("Invalid encrypted credential");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

export function safeCompareSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && a.every((value, index) => value === b[index]);
}
