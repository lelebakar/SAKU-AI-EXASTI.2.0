import { describe, expect, it } from "vitest";
import { cosineSimilarity, parseEmbedding } from "./embeddings";

describe("memory embeddings", () => {
  it("parses valid stored vectors and rejects malformed values", () => {
    expect(parseEmbedding("[1, 0.5, -2]")).toEqual([1, 0.5, -2]);
    expect(parseEmbedding("not-json")).toBeUndefined();
    expect(parseEmbedding("[1, \"bad\"]")).toBeUndefined();
  });

  it("calculates cosine similarity for compatible vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], undefined)).toBeUndefined();
    expect(cosineSimilarity([1, 0], [1])).toBeUndefined();
  });
});
