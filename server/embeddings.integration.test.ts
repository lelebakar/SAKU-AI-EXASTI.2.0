import { describe, expect, it, vi } from "vitest";
import { createTextEmbedding } from "./embeddings";
import { selectRelevantMemories } from "./db";
import { ENV } from "./_core/env";

describe("semantic memory embedding contract", () => {
  it("creates a vector and finds a saved memory with different wording", async () => {
    const originalForgeApiUrl = ENV.forgeApiUrl;
    const originalForgeApiKey = ENV.forgeApiKey;
    const originalFetch = globalThis.fetch;
    ENV.forgeApiUrl = "https://forge.test";
    ENV.forgeApiKey = "test-forge-key";
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ values: Array.from({ length: 16 }, () => 0.5) }) } }] }), { status: 200 })) as typeof fetch;

    try {
    const savedMemory = "Pelanggan utama menunggu jawaban penawaran sebelum Jumat.";
    const query = "Siapa calon pembeli yang masih perlu di-follow up?";
    const savedVector = await createTextEmbedding(savedMemory);
    const queryVector = await createTextEmbedding(query);

    expect(savedVector, "embedding provider must return a vector").toBeDefined();
    expect(queryVector, "embedding provider must return a query vector").toBeDefined();
    const results = selectRelevantMemories([
      { memory: savedMemory, importance: "high", embeddingJson: JSON.stringify(savedVector) },
    ], query, queryVector);

    expect(results).toHaveLength(1);
    expect(results[0]?.memory).toBe(savedMemory);
    } finally {
      ENV.forgeApiUrl = originalForgeApiUrl;
      ENV.forgeApiKey = originalForgeApiKey;
      globalThis.fetch = originalFetch;
    }
  }, 30_000);
});
