import { afterEach, describe, expect, it } from "vitest";
import { consumeRateLimit, createDatabaseRateLimitStore, createMemoryRateLimitStore, resetRateLimits } from "./rate-limit";

describe("rate limiting", () => {
  const store = createMemoryRateLimitStore();

  afterEach(async () => store.reset());

  it("limits a key within its window and keeps other keys independent", async () => {
    expect((await store.consume("owner:a", 2, 60_000, 1)).allowed).toBe(true);
    expect((await store.consume("owner:a", 2, 60_000, 2)).allowed).toBe(true);
    expect(await store.consume("owner:a", 2, 60_000, 3)).toMatchObject({ allowed: false, remaining: 0 });
    expect((await store.consume("owner:b", 2, 60_000, 3)).allowed).toBe(true);
  });

  it("starts a fresh window after expiry", async () => {
    expect((await store.consume("integration:1", 1, 100, 1)).allowed).toBe(true);
    expect((await store.consume("integration:1", 1, 100, 50)).allowed).toBe(false);
    expect((await store.consume("integration:1", 1, 100, 101)).allowed).toBe(true);
  });

  it("shares a bucket across independent limiter instances", async () => {
    const key = `test:multi-instance:${Date.now()}`;
    const instanceA = createDatabaseRateLimitStore();
    const instanceB = createDatabaseRateLimitStore();
    const now = Date.now();
    expect((await instanceA.consume(key, 1, 1, now)).allowed).toBe(true);
    expect((await instanceB.consume(key, 1, 1, now)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await resetRateLimits();
  });
});
