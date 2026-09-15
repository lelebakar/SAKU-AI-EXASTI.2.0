import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState, encodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      const account = await db.upsertOAuthUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? "social",
      });

      const sessionToken = await sdk.createSessionToken(account?.openId || userInfo.openId, {
        name: account?.name || userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

function googleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectOrigin: (process.env.GOOGLE_OAUTH_REDIRECT_ORIGIN ?? "").replace(/\/$/, ""),
  };
}

/** Optional Google sign-in for deployments that provide Google OAuth credentials. */
export function registerGoogleOAuthRoutes(app: Express) {
  app.get("/api/auth/google/start", (req: Request, res: Response) => {
    const { clientId, clientSecret, redirectOrigin } = googleConfig();
    if (!clientId || !clientSecret || !redirectOrigin) {
      res.status(503).json({ error: "Google OAuth is not configured" });
      return;
    }

    const requestedOrigin = getQueryParam(req, "origin")?.replace(/\/$/, "") || redirectOrigin;
    if (requestedOrigin !== redirectOrigin) {
      res.status(403).json({ error: "Google OAuth origin is not allowlisted" });
      return;
    }

    const nonce = randomUUID();
    const redirectUri = `${redirectOrigin}/api/auth/google/callback`;
    const state = encodeURIComponent(Buffer.from(JSON.stringify({ redirectUri, nonce })).toString("base64"));
    res.cookie(OAUTH_STATE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 10 * 60 * 1000 });
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      state: decodeURIComponent(state),
    }).toString();
    res.redirect(302, authorizationUrl.toString());
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const state = getQueryParam(req, "state");
    const code = getQueryParam(req, "code");
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    const decoded = state ? decodeOAuthState(state) : { redirectUri: "", nonce: undefined };
    if (!state || !decoded.nonce || !expectedNonce || decoded.nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid Google oauth state" });
      return;
    }

    const { clientId, clientSecret, redirectOrigin } = googleConfig();
    const expectedRedirectUri = `${redirectOrigin}/api/auth/google/callback`;
    if (!clientId || !clientSecret || !redirectOrigin || decoded.redirectUri !== expectedRedirectUri) {
      res.status(503).json({ error: "Google OAuth is not configured" });
      return;
    }
    if (!code) {
      res.status(400).json({ error: "Google authorization code is required" });
      return;
    }

    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: expectedRedirectUri, grant_type: "authorization_code" }),
      });
      if (!tokenResponse.ok) throw new Error(`Google token exchange failed (${tokenResponse.status})`);
      const token = await tokenResponse.json() as { access_token?: string };
      if (!token.access_token) throw new Error("Google access token missing");
      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token.access_token}` } });
      if (!profileResponse.ok) throw new Error(`Google profile request failed (${profileResponse.status})`);
      const profile = await profileResponse.json() as { sub?: string; name?: string; email?: string };
      if (!profile.sub) throw new Error("Google profile subject missing");

      const openId = `google:${profile.sub}`;
      const account = await db.upsertOAuthUser({ openId, name: profile.name ?? null, email: profile.email ?? null, loginMethod: "google" });
      const sessionToken = await sdk.createSessionToken(account?.openId || openId, { name: account?.name || (profile.name ?? ""), expiresInMs: ONE_YEAR_MS });
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, `${redirectOrigin}/`);
    } catch (error) {
      console.error("[Google OAuth] Callback failed", error);
      res.status(500).json({ error: "Google OAuth callback failed" });
    }
  });
}


type MetaProvider = "facebook" | "instagram";

function metaConfig(provider: MetaProvider) {
  const prefix = provider === "facebook" ? "META" : "INSTAGRAM";
  return {
    appId: process.env[`${prefix}_APP_ID`] ?? "",
    appSecret: process.env[`${prefix}_APP_SECRET`] ?? "",
    redirectOrigin: (process.env[`${prefix}_OAUTH_REDIRECT_ORIGIN`] ?? "").replace(/\/$/, ""),
  };
}

function metaRedirectUri(provider: MetaProvider, origin: string) {
  return `${origin}/api/auth/meta/${provider}/callback`;
}

/** Separate Meta provider flows. Facebook and Instagram use different OAuth hosts and profile APIs. */
export function registerMetaOAuthRoutes(app: Express) {
  for (const provider of ["facebook", "instagram"] as const) {
    app.get(`/api/auth/meta/${provider}/start`, (req: Request, res: Response) => {
      const { appId, appSecret, redirectOrigin } = metaConfig(provider);
      if (!appId || !appSecret || !redirectOrigin) {
        res.status(503).json({ error: `${provider} OAuth is not configured` });
        return;
      }
      const requestedOrigin = getQueryParam(req, "origin")?.replace(/\/$/, "") || redirectOrigin;
      if (requestedOrigin !== redirectOrigin) {
        res.status(403).json({ error: `${provider} OAuth origin is not allowlisted` });
        return;
      }
      const nonce = randomUUID();
      const redirectUri = metaRedirectUri(provider, redirectOrigin);
      const state = encodeOAuthState({ redirectUri, nonce });
      res.cookie(OAUTH_STATE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 10 * 60 * 1000 });
      const authorizationUrl = provider === "facebook"
        ? new URL("https://www.facebook.com/v26.0/dialog/oauth")
        : new URL("https://api.instagram.com/oauth/authorize");
      authorizationUrl.search = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: provider === "facebook" ? "email,public_profile" : "instagram_business_basic",
        state,
      }).toString();
      res.redirect(302, authorizationUrl.toString());
    });

    app.get(`/api/auth/meta/${provider}/callback`, async (req: Request, res: Response) => {
      const state = getQueryParam(req, "state");
      const code = getQueryParam(req, "code")?.replace(/#_$/, "");
      const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
      const decoded = state ? decodeOAuthState(state) : { redirectUri: "", nonce: undefined };
      const { appId, appSecret, redirectOrigin } = metaConfig(provider);
      const expectedRedirectUri = metaRedirectUri(provider, redirectOrigin);
      if (!state || !decoded.nonce || !expectedNonce || decoded.nonce !== expectedNonce) {
        res.status(403).json({ error: `invalid ${provider} oauth state` });
        return;
      }
      if (!appId || !appSecret || !redirectOrigin || decoded.redirectUri !== expectedRedirectUri) {
        res.status(503).json({ error: `${provider} OAuth is not configured` });
        return;
      }
      if (!code) {
        res.status(400).json({ error: `${provider} authorization code is required` });
        return;
      }
      res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
      try {
        let accessToken = "";
        if (provider === "facebook") {
          const tokenUrl = new URL("https://graph.facebook.com/v26.0/oauth/access_token");
          tokenUrl.search = new URLSearchParams({ client_id: appId, redirect_uri: expectedRedirectUri, client_secret: appSecret, code }).toString();
          const tokenResponse = await fetch(tokenUrl);
          if (!tokenResponse.ok) throw new Error(`Facebook token exchange failed (${tokenResponse.status})`);
          const token = await tokenResponse.json() as { access_token?: string };
          accessToken = token.access_token ?? "";
        } else {
          const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: appId, client_secret: appSecret, grant_type: "authorization_code", redirect_uri: expectedRedirectUri, code }),
          });
          if (!tokenResponse.ok) throw new Error(`Instagram token exchange failed (${tokenResponse.status})`);
          const token = await tokenResponse.json() as { access_token?: string };
          accessToken = token.access_token ?? "";
        }
        if (!accessToken) throw new Error(`${provider} access token missing`);
        const profileUrl = provider === "facebook"
          ? `https://graph.facebook.com/v26.0/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`
          : `https://graph.instagram.com/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`;
        const profileResponse = await fetch(profileUrl);
        if (!profileResponse.ok) throw new Error(`${provider} profile request failed (${profileResponse.status})`);
        const profile = await profileResponse.json() as { id?: string; name?: string; username?: string; email?: string };
        if (!profile.id) throw new Error(`${provider} profile id missing`);
        const account = await db.upsertOAuthUser({
          openId: `meta:${provider}:${profile.id}`,
          name: profile.name || profile.username || null,
          email: profile.email || null,
          loginMethod: provider,
        });
        const sessionToken = await sdk.createSessionToken(account?.openId || `meta:${provider}:${profile.id}`, { name: account?.name || profile.name || profile.username || provider, expiresInMs: ONE_YEAR_MS });
        res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
        res.redirect(302, `${redirectOrigin}/`);
      } catch (error) {
        console.error(`[${provider} OAuth] Callback failed`, error);
        res.status(500).json({ error: `${provider} OAuth callback failed` });
      }
    });
  }
}
