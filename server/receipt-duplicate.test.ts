import { describe, expect, it } from "vitest";
import { canonicalizeReceiptItems, isReceiptDuplicate } from "./db";

describe("receipt duplicate detection", () => {
  const items = JSON.stringify([{ name: "Kopi", quantity: 2, unitPrice: 15000, total: 30000 }, { name: "Gula", quantity: 1, unitPrice: 10000, total: 10000 }]);

  it("matches same vendor, total, and items regardless of item order or casing", () => {
    const reversed = JSON.stringify([{ name: "gula", quantity: 1, unitPrice: 10000, total: 10000 }, { name: "KOPI", quantity: 2, unitPrice: 15000, total: 30000 }]);
    expect(isReceiptDuplicate({ vendor: "TOKO RONA", total: 40000, itemsText: items }, { vendor: "Toko Rona", total: 40000, itemsText: reversed })).toBe(true);
    expect(canonicalizeReceiptItems(items)).toBe(canonicalizeReceiptItems(reversed));
  });

  it("does not flag a different amount or item set", () => {
    expect(isReceiptDuplicate({ vendor: "Toko Rona", total: 40000, itemsText: items }, { vendor: "Toko Rona", total: 41000, itemsText: items })).toBe(false);
    expect(isReceiptDuplicate({ vendor: "Toko Rona", total: 40000, itemsText: items }, { vendor: "Toko Rona", total: 40000, itemsText: JSON.stringify([{ name: "Kopi", quantity: 1, unitPrice: 15000, total: 15000 }]) })).toBe(false);
  });
});
