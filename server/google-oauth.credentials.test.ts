import { describe, expect, it } from "vitest";

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REDIRECT_ORIGIN);

describe("Google OAuth credentials", () => {
  it.skipIf(!googleConfigured)("are accepted by Google's token endpoint", async () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.GOOGLE_OAUTH_REDIRECT_ORIGIN}/api/auth/google/callback`;
    expect(clientId).toBeTruthy();
    expect(clientSecret).toBeTruthy();
    expect(redirectUri).toMatch(/^https:\/\//);

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        code: "saku-credential-check",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const body = await response.text();
    expect(response.status).toBe(400);
    expect(body).not.toContain("invalid_client");
    expect(body).toContain("invalid_grant");
  }, 20_000);
});
