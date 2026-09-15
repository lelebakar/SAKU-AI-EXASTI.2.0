import { ENV } from "./_core/env";

export type Embedding = number[];
export type EmbeddingProvider = "openai" | "keyword";
export type EmbeddingResult = { embedding: Embedding; provider: EmbeddingProvider };

function externalEmbeddingConfig() {
  const apiKey = ENV.openaiApiKey || process.env.OPENAI_API_KEY || "";
  if (!apiKey) return undefined;
  return {
    apiKey,
    baseUrl: (ENV.openaiBaseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: ENV.openaiEmbeddingModel || process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
  };
}

async function createExternalEmbedding(text: string): Promise<Embedding | undefined> {
  const config = externalEmbeddingConfig();
  if (!config) return undefined;
  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, input: text }),
  });
  if (!response.ok) throw new Error(`external embedding request failed with status ${response.status}`);
  const payload = await response.json() as { data?: Array<{ embedding?: unknown }> };
  const vector = payload.data?.[0]?.embedding;
  return Array.isArray(vector) && vector.length > 0 && vector.every((item) => typeof item === "number") ? vector as number[] : undefined;
}

/** Use a real embedding provider when configured; callers use keyword search otherwise. */
export async function createTextEmbeddingWithProvider(text: string): Promise<EmbeddingResult | undefined> {
  const value = text.trim();
  if (!value) {
    console.warn("[Embeddings] provider=none error=empty input");
    return undefined;
  }

  const external = externalEmbeddingConfig();
  if (external) {
    const startedAt = Date.now();
    try {
      const vector = await createExternalEmbedding(value);
      if (vector) {
        console.info(`[Embeddings] provider=openai model=${external.model} latencyMs=${Date.now() - startedAt}`);
        return { embedding: vector, provider: "openai" };
      }
      throw new Error("external embedding response did not contain a numeric vector");
    } catch (error) {
      console.warn(`[Embeddings] provider=openai latencyMs=${Date.now() - startedAt} error=${error instanceof Error ? error.message : String(error)}; keyword fallback will be used`);
    }
  }

  console.info("[Embeddings] provider=keyword reason=no external embedding provider configured");
  return undefined;
}

export async function createTextEmbedding(text: string): Promise<Embedding | undefined> {
  return (await createTextEmbeddingWithProvider(text))?.embedding;
}

export function parseEmbedding(value: string | null | undefined): Embedding | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "number") ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function cosineSimilarity(left: Embedding, right: Embedding | undefined): number | undefined {
  if (!left.length || !right || left.length !== right.length) return undefined;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return undefined;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
