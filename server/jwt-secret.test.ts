import { describe, expect, it } from "vitest";
import { assertJwtSecret, MIN_JWT_SECRET_LENGTH } from "./_core/env";
import { sdk } from "./_core/sdk";

describe("JWT_SECRET validation", () => {
  it("rejects a missing or blank secret", () => {
    expect(() => assertJwtSecret("")).toThrow("JWT_SECRET is required");
    expect(() => assertJwtSecret("   ")).toThrow("JWT_SECRET is required");
  });

  it("rejects secrets shorter than the minimum", () => {
    expect(() => assertJwtSecret("x".repeat(MIN_JWT_SECRET_LENGTH - 1))).toThrow(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  });

  it("accepts a strong secret", () => {
    const secret = "a".repeat(MIN_JWT_SECRET_LENGTH);
    expect(assertJwtSecret(secret)).toBe(secret);
  });

  it("uses the configured project secret for a session round trip", async () => {
    const configuredSecret = process.env.SAKU_JWT_SECRET ?? process.env.JWT_SECRET;
    expect(configuredSecret).toBeTruthy();
    expect(assertJwtSecret(configuredSecret)).toBe(configuredSecret);
    const token = await sdk.createSessionToken("jwt-test-user", { name: "JWT Test User" });
    await expect(sdk.verifySession(token)).resolves.toMatchObject({ openId: "jwt-test-user", name: "JWT Test User" });
  });
});
