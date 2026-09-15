import { describe, expect, it } from "vitest";
import { createPasswordResetTokenValue, hashPasswordResetToken } from "./db";
import { getPublicOrigin } from "./password-reset-email";

describe("password reset helpers", () => {
  it("creates a high-entropy token and stores only its hash", () => {
    const token = createPasswordResetTokenValue();
    const secondToken = createPasswordResetTokenValue();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(secondToken).toMatch(/^[a-f0-9]{64}$/);
    expect(secondToken).not.toBe(token);
    expect(hashPasswordResetToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPasswordResetToken(token)).not.toBe(token);
    expect(hashPasswordResetToken(token)).toBe(hashPasswordResetToken(token));
  });

  it("builds reset links from the forwarded public host", () => {
    expect(getPublicOrigin({ protocol: "http", headers: { host: "localhost:3000" } })).toBe("http://localhost:3000");
    expect(getPublicOrigin({ protocol: "http", headers: { host: "internal:3000", "x-forwarded-host": "saku.example.com", "x-forwarded-proto": "https" } })).toBe("https://saku.example.com");
  });
});
