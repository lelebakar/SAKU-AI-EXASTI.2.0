import { describe, expect, it } from "vitest";
import { assertStrongPassword, hashPassword, normalizeEmail, verifyPassword } from "./password-auth";
import { mergeLoginMethods } from "./db";

describe("password authentication", () => {
  it("normalizes email addresses", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("hashes and verifies a strong password without storing plaintext", async () => {
    const password = "AmanSekali123";
    const encoded = await hashPassword(password);
    expect(encoded).toMatch(/^scrypt\$/);
    expect(encoded).not.toContain(password);
    await expect(verifyPassword(password, encoded)).resolves.toBe(true);
    await expect(verifyPassword("SalahSekali123", encoded)).resolves.toBe(false);
  });

  it("requires a strong password", () => {
    expect(() => assertStrongPassword("short")).toThrow();
    expect(() => assertStrongPassword("semuakecil123")).toThrow();
    expect(() => assertStrongPassword("SemuaBesar")).toThrow();
    expect(() => assertStrongPassword("AmanSekali123")).not.toThrow();
  });

  it("merges social providers without duplicate labels", () => {
    expect(mergeLoginMethods("email,google", "google")).toBe("email,google");
    expect(mergeLoginMethods("email", "social")).toBe("email,social");
  });
});
