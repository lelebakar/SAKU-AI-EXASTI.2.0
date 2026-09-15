import { describe, expect, it, vi } from "vitest";
import { createTextEmbedding, createTextEmbeddingWithProvider } from "./embeddings";
import { ENV } from "./_core/env";

describe("Manus-only embedding provider", () => {
  it("uses the optional external provider when configured", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.OPENAI_API_KEY = "test-openai-key";
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 })) as typeof fetch;
    try {
      await expect(createTextEmbeddingWithProvider("memory")).resolves.toEqual({ embedding: [0.1, 0.2, 0.3], provider: "openai" });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[0])).toContain("/embeddings");
    } finally {
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to the projection when the optional provider fails", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const originalForgeApiUrl = ENV.forgeApiUrl;
    const originalForgeApiKey = ENV.forgeApiKey;
    process.env.OPENAI_API_KEY = "test-openai-key";
    ENV.forgeApiUrl = "https://forge.test";
    ENV.forgeApiKey = "test-forge-key";
    globalThis.fetch = vi.fn(async () => {
      if (vi.mocked(globalThis.fetch).mock.calls.length === 1) throw new Error("external unavailable");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ values: Array.from({ length: 16 }, () => 0.25) }) } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      await expect(createTextEmbeddingWithProvider("memory")).resolves.toMatchObject({ provider: "manus-projection", embedding: expect.any(Array) });
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    } finally {
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
      ENV.forgeApiUrl = originalForgeApiUrl;
      ENV.forgeApiKey = originalForgeApiKey;
      globalThis.fetch = originalFetch;
    }
  });

  it("uses the supported Forge chat endpoint for semantic projection", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = ENV.openaiApiKey;
    const originalProcessKey = process.env.OPENAI_API_KEY;
    const originalForgeApiUrl = ENV.forgeApiUrl;
    const originalForgeApiKey = ENV.forgeApiKey;
    ENV.openaiApiKey = "";
    ENV.forgeApiUrl = "https://forge.test";
    ENV.forgeApiKey = "test-forge-key";
    delete process.env.OPENAI_API_KEY;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ values: Array.from({ length: 16 }, () => 0.5) }) } }] }), { status: 200 })) as typeof fetch;
    const vector = await createTextEmbedding("memory");
    expect(vector).toHaveLength(16);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    ENV.openaiApiKey = originalKey;
    ENV.forgeApiUrl = originalForgeApiUrl;
    ENV.forgeApiKey = originalForgeApiKey;
    if (originalProcessKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalProcessKey;
    globalThis.fetch = originalFetch;
  });

  it("returns undefined for keyword fallback when Manus projection fails", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = ENV.openaiApiKey;
    const originalProcessKey = process.env.OPENAI_API_KEY;
    const originalForgeApiUrl = ENV.forgeApiUrl;
    const originalForgeApiKey = ENV.forgeApiKey;
    ENV.openaiApiKey = "";
    ENV.forgeApiUrl = "https://forge.test";
    ENV.forgeApiKey = "test-forge-key";
    delete process.env.OPENAI_API_KEY;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 })) as typeof fetch;
    await expect(createTextEmbedding("memory")).resolves.toBeUndefined();
    ENV.openaiApiKey = originalKey;
    ENV.forgeApiUrl = originalForgeApiUrl;
    ENV.forgeApiKey = originalForgeApiKey;
    if (originalProcessKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalProcessKey;
    globalThis.fetch = originalFetch;
  });
});
