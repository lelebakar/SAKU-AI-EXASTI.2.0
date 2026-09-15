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

  it("does not call an LLM when the optional provider fails", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.OPENAI_API_KEY = "test-openai-key";
    globalThis.fetch = vi.fn(async () => { throw new Error("external unavailable"); }) as typeof fetch;
    try {
      await expect(createTextEmbeddingWithProvider("memory")).resolves.toBeUndefined();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } finally {
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
      globalThis.fetch = originalFetch;
    }
  });

  it("uses keyword fallback without making an LLM request when no provider is configured", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = ENV.openaiApiKey;
    const originalProcessKey = process.env.OPENAI_API_KEY;
    ENV.openaiApiKey = "";
    delete process.env.OPENAI_API_KEY;
    globalThis.fetch = vi.fn() as typeof fetch;
    const vector = await createTextEmbedding("memory");
    expect(vector).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    ENV.openaiApiKey = originalKey;
    if (originalProcessKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalProcessKey;
    globalThis.fetch = originalFetch;
  });
});
