import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { encryptCredential } from "./credential-crypto";
import { getDb, getSakuWorkspace } from "./db";
import { sakuIntegrationCredentials } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";

export const GOOGLE_SHEETS_STATE_COOKIE = "saku_google_sheets_oauth_state";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function googleSheetsConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectOrigin: (process.env.GOOGLE_OAUTH_REDIRECT_ORIGIN ?? "").replace(/\/$/, ""),
  };
}

function encodeState(value: Record<string, string>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeState(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { nonce?: string; ownerOpenId?: string; redirectUri?: string };
  } catch {
    return {};
  }
}

function queryParam(req: Request, key: string) {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

async function requireOwner(req: Request) {
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    return null;
  }
}

export function registerGoogleSheetsOAuthRoutes(app: Express) {
  app.get("/api/integrations/google-sheets/start", async (req: Request, res: Response) => {
    const owner = await requireOwner(req);
    if (!owner) {
      res.status(401).json({ error: "Google Sheets hanya bisa dihubungkan setelah login." });
      return;
    }
    const { clientId, clientSecret, redirectOrigin } = googleSheetsConfig();
    if (!clientId || !clientSecret || !redirectOrigin) {
      res.status(503).json({ error: "Google Sheets OAuth belum dikonfigurasi." });
      return;
    }
    const nonce = randomUUID();
    const redirectUri = `${redirectOrigin}/api/integrations/google-sheets/callback`;
    const state = encodeState({ nonce, ownerOpenId: owner.openId, redirectUri });
    res.cookie(GOOGLE_SHEETS_STATE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 10 * 60 * 1000 });
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SHEETS_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();
    res.redirect(302, authorizationUrl.toString());
  });

  app.get("/api/integrations/google-sheets/callback", async (req: Request, res: Response) => {
    const state = queryParam(req, "state");
    const code = queryParam(req, "code");
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[GOOGLE_SHEETS_STATE_COOKIE];
    const decoded = state ? decodeState(state) : {};
    const { clientId, clientSecret, redirectOrigin } = googleSheetsConfig();
    const expectedRedirectUri = `${redirectOrigin}/api/integrations/google-sheets/callback`;

    if (!state || !decoded.nonce || !expectedNonce || decoded.nonce !== expectedNonce || decoded.redirectUri !== expectedRedirectUri || !decoded.ownerOpenId) {
      res.status(403).json({ error: "State OAuth Google Sheets tidak valid." });
      return;
    }
    if (!clientId || !clientSecret || !redirectOrigin) {
      res.status(503).json({ error: "Google Sheets OAuth belum dikonfigurasi." });
      return;
    }
    if (!code) {
      res.status(400).json({ error: "Kode otorisasi Google Sheets diperlukan." });
      return;
    }

    res.clearCookie(GOOGLE_SHEETS_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const owner = await requireOwner(req);
      if (!owner || owner.openId !== decoded.ownerOpenId) {
        res.status(403).json({ error: "Sesi pemilik Google Sheets tidak cocok." });
        return;
      }
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: expectedRedirectUri, grant_type: "authorization_code" }),
      });
      if (!tokenResponse.ok) throw new Error(`Google Sheets token exchange failed (${tokenResponse.status})`);
      const token = await tokenResponse.json() as { refresh_token?: string };
      if (!token.refresh_token) throw new Error("Google tidak mengembalikan refresh token. Coba hubungkan ulang dengan consent.");

      const workspace = await getSakuWorkspace(decoded.ownerOpenId);
      if (!workspace) {
        res.status(400).json({ error: "Selesaikan onboarding workspace sebelum menghubungkan Google Sheets." });
        return;
      }
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      const existing = await db.select().from(sakuIntegrationCredentials).where(and(eq(sakuIntegrationCredentials.workspaceId, workspace.id), eq(sakuIntegrationCredentials.provider, "google_sheets"))).limit(1);
      const encryptedRefreshToken = encryptCredential(token.refresh_token);
      if (existing[0]) {
        await db.update(sakuIntegrationCredentials).set({ apiKeyEncrypted: encryptedRefreshToken, webhookSecretEncrypted: null, status: "active", updatedAt: new Date() }).where(eq(sakuIntegrationCredentials.id, existing[0].id));
      } else {
        await db.insert(sakuIntegrationCredentials).values({ workspaceId: workspace.id, provider: "google_sheets", apiKeyEncrypted: encryptedRefreshToken, webhookSecretEncrypted: null, metadataJson: JSON.stringify({ spreadsheets: {} }), status: "active" });
      }
      res.redirect(302, `${redirectOrigin}/?googleSheets=connected`);
    } catch (error) {
      console.error("[Google Sheets OAuth] Callback failed", error);
      res.status(500).json({ error: "Google Sheets OAuth gagal diselesaikan." });
    }
  });
}
