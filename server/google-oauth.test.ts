import { describe, expect, it } from "vitest";
import type { Express, Request, Response } from "express";
import { decodeOAuthState, encodeOAuthState, OAUTH_STATE_COOKIE } from "@shared/const";
import { registerGoogleOAuthRoutes, registerMetaOAuthRoutes } from "./_core/oauth";

const origin = "https://sakuai-fojka6k5.manus.space";
const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REDIRECT_ORIGIN);

type RouteHandler = (req: Request, res: Response) => unknown;

function registeredRoutes() {
  const routes = new Map<string, RouteHandler>();
  registerGoogleOAuthRoutes({ get: (path: string, handler: RouteHandler) => routes.set(path, handler) } as unknown as Express);
  return routes;
}

function registeredMetaRoutes() {
  const routes = new Map<string, RouteHandler>();
  registerMetaOAuthRoutes({ get: (path: string, handler: RouteHandler) => routes.set(path, handler) } as unknown as Express);
  return routes;
}

function responseRecorder() {
  const state: { status?: number; body?: unknown; redirect?: string; cookies: Record<string, { value: string; options: unknown }> } = { cookies: {} };
  const response = {
    status(code: number) { state.status = code; return response; },
    json(body: unknown) { state.body = body; return response; },
    cookie(name: string, value: string, options: unknown) { state.cookies[name] = { value, options }; return response; },
    clearCookie() { return response; },
    redirect(_code: number, url: string) { state.status = _code; state.redirect = url; return response; },
  } as unknown as Response;
  return { state, response };
}

describe("Google OAuth routes", () => {
  it("rejects unallowlisted origins before redirecting to Google", async () => {
    const handler = registeredRoutes().get("/api/auth/google/start")!;
    const { state, response } = responseRecorder();
    await handler({ query: { origin: "https://evil.example" }, protocol: "https", headers: {} } as unknown as Request, response);
    expect(state.status).toBe(503);
    expect(state.body).toMatchObject({ error: expect.stringContaining("not configured") });
  });

  it.skipIf(!googleConfigured)("creates a Google authorization redirect with a nonce-bound state", async () => {
    const handler = registeredRoutes().get("/api/auth/google/start")!;
    const { state, response } = responseRecorder();
    await handler({ query: { origin }, protocol: "https", headers: {} } as unknown as Request, response);
    const redirect = new URL(state.redirect!);
    const decoded = decodeOAuthState(redirect.searchParams.get("state")!);
    expect(state.status).toBe(302);
    expect(redirect.origin).toBe("https://accounts.google.com");
    expect(redirect.searchParams.get("client_id")).toContain(".apps.googleusercontent.com");
    expect(decoded.redirectUri).toBe(`${origin}/api/auth/google/callback`);
    expect(decoded.nonce).toBe(state.cookies[OAUTH_STATE_COOKIE]?.value);
  });

  it("rejects a callback when the state nonce does not match the browser cookie", async () => {
    const handler = registeredRoutes().get("/api/auth/google/callback")!;
    const { state, response } = responseRecorder();
    const encodedState = encodeOAuthState({ redirectUri: `${origin}/api/auth/google/callback`, nonce: "expected" });
    await handler({ query: { code: "not-used", state: encodedState }, protocol: "https", headers: { cookie: `${OAUTH_STATE_COOKIE}=different` } } as unknown as Request, response);
    expect(state.status).toBe(403);
    expect(state.body).toMatchObject({ error: "invalid Google oauth state" });
  });
});


describe("Meta OAuth routes", () => {
  it("registers separate Facebook and Instagram endpoints", () => {
    const routes = registeredMetaRoutes();
    expect(routes.has("/api/auth/meta/facebook/start")).toBe(true);
    expect(routes.has("/api/auth/meta/facebook/callback")).toBe(true);
    expect(routes.has("/api/auth/meta/instagram/start")).toBe(true);
    expect(routes.has("/api/auth/meta/instagram/callback")).toBe(true);
  });

  it("returns a clear configuration response when Facebook credentials are missing", async () => {
    const handler = registeredMetaRoutes().get("/api/auth/meta/facebook/start")!;
    const { state, response } = responseRecorder();
    await handler({ query: { origin }, protocol: "https", headers: {} } as unknown as Request, response);
    expect(state.status).toBe(503);
    expect(state.body).toMatchObject({ error: expect.stringContaining("facebook OAuth is not configured") });
  });
});
