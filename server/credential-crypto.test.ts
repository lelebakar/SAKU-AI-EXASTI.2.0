import { afterEach, describe, expect, it } from "vitest";
import { assertIntegrationEncryptionKey, decryptCredential, encryptCredential } from "./credential-crypto";
import { verifyMootaSignature } from "./reconciliation";
import { createHmac } from "node:crypto";

const originalIntegrationKey = process.env.INTEGRATION_ENCRYPTION_KEY;
const originalJwtSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (originalIntegrationKey === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
  else process.env.INTEGRATION_ENCRYPTION_KEY = originalIntegrationKey;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

describe("integration credential security", () => {
  it("encrypts and decrypts credentials with the dedicated key", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = "integration-key-for-tests-32-chars!!";
    const encrypted = encryptCredential("moota-secret");
    expect(encrypted).not.toContain("moota-secret");
    expect(decryptCredential(encrypted)).toBe("moota-secret");
  });

  it("accepts the configured managed integration key", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = "integration-key-for-tests-32-chars!!";
    expect(assertIntegrationEncryptionKey().length).toBeGreaterThanOrEqual(32);
  });

  it("rejects a missing key and never falls back to JWT_SECRET", () => {
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    process.env.JWT_SECRET = "jwt-secret-that-must-not-encrypt-integrations";
    expect(() => assertIntegrationEncryptionKey()).toThrow("INTEGRATION_ENCRYPTION_KEY is required");
    expect(() => encryptCredential("moota-secret")).toThrow("INTEGRATION_ENCRYPTION_KEY is required");
  });

  it("rejects a dedicated key shorter than 32 characters", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = "too-short";
    expect(() => assertIntegrationEncryptionKey()).toThrow("at least 32 characters");
  });

  it("accepts the correct Moota signature and rejects tampering", () => {
    const body = JSON.stringify({ id: "mut-1", amount: 100000 });
    const signature = createHmac("sha256", "webhook-secret").update(body).digest("hex");
    expect(verifyMootaSignature(body, signature, "webhook-secret")).toBe(true);
    expect(verifyMootaSignature(body, "webhook-secret", "webhook-secret")).toBe(true);
    expect(verifyMootaSignature(body + "x", signature, "webhook-secret")).toBe(false);
    expect(verifyMootaSignature(body, undefined, "webhook-secret")).toBe(false);
  });
});
