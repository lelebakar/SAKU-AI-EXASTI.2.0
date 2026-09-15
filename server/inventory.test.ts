import { describe, expect, it } from "vitest";
import { calculateSakuInventoryQuantity, calculateSakuProductionConsumption } from "./db";

describe("inventory quantity calculation", () => {
  it("adds incoming stock to the current balance", () => {
    expect(calculateSakuInventoryQuantity(12, "in", 8)).toBe(20);
  });

  it("subtracts outgoing stock from the current balance", () => {
    expect(calculateSakuInventoryQuantity(12, "out", 5)).toBe(7);
  });

  it("sets an explicit balance for an adjustment", () => {
    expect(calculateSakuInventoryQuantity(12, "adjustment", 4)).toBe(4);
  });

  it("rejects an outgoing movement larger than available stock", () => {
    expect(() => calculateSakuInventoryQuantity(3, "out", 4)).toThrow("Stok tidak cukup");
  });

  it("rejects zero or negative movements", () => {
    expect(() => calculateSakuInventoryQuantity(3, "in", 0)).toThrow("Jumlah stok");
    expect(() => calculateSakuInventoryQuantity(3, "out", -1)).toThrow("Jumlah stok");
  });

  it("supports fractional stock movements", () => {
    expect(calculateSakuInventoryQuantity(1.5, "out", 0.25)).toBe(1.25);
    expect(calculateSakuInventoryQuantity(0, "in", 0.15)).toBe(0.15);
  });

  it("scales recipe ingredients to the requested production quantity", () => {
    expect(calculateSakuProductionConsumption(200, 5, 1)).toBe(1000);
    expect(calculateSakuProductionConsumption(200, 5, 1, 10)).toBe(1100);
  });

  it("preserves fractional scaled recipe consumption", () => {
    expect(calculateSakuProductionConsumption(3, 2, 2)).toBe(3);
    expect(calculateSakuProductionConsumption(0.25, 4, 1)).toBe(1);
  });

  it("rejects invalid production recipe parameters", () => {
    expect(() => calculateSakuProductionConsumption(0, 2, 1)).toThrow("Parameter konsumsi");
  });
});
