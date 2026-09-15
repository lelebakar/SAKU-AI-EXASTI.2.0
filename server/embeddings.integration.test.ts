import { describe, expect, it, vi } from "vitest";
import { createTextEmbedding } from "./embeddings";
import { selectRelevantMemories } from "./db";
import { ENV } from "./_core/env";

describe("memory retrieval without a real embedding provider", () => {
  it("uses keyword retrieval without calling the LLM", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = ENV.openaiApiKey;
    const originalProcessKey = process.env.OPENAI_API_KEY;
    ENV.openaiApiKey = "";
    delete process.env.OPENAI_API_KEY;
    globalThis.fetch = vi.fn() as typeof fetch;

    try {
      const savedMemory = "Pelanggan utama menunggu jawaban penawaran sebelum Jumat.";
      const query = "Pelanggan penawaran";
      const queryVector = await createTextEmbedding(query);

      expect(queryVector).toBeUndefined();
      expect(globalThis.fetch).not.toHaveBeenCalled();
      const results = selectRelevantMemories([
        { memory: savedMemory, importance: "medium", embeddingJson: null },
      ], query, queryVector);

      expect(results).toHaveLength(1);
      expect(results[0]?.memory).toBe(savedMemory);
    } finally {
      ENV.openaiApiKey = originalKey;
      if (originalProcessKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalProcessKey;
      globalThis.fetch = originalFetch;
    }
  }, 30_000);
});
