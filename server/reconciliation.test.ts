import { describe, expect, it } from "vitest";
import { matchReceivable, matchReconciliationRule, normalizeMootaMutation } from "./reconciliation";

describe("Moota reconciliation matching", () => {
  const base = { type: "credit" as const, amount: 250000, description: "Transfer PT Rona" };

  it("matches one exact open receivable", () => {
    const result = matchReceivable(base, [{ id: 1, amount: 250000, customerReference: "PT Rona", status: "open" }]);
    expect(result.status).toBe("matched");
    expect(result.candidate?.id).toBe(1);
  });

  it("leaves unmatched mutation unidentified", () => {
    const result = matchReceivable({ ...base, amount: 300000 }, [{ id: 1, amount: 250000, customerReference: "PT Rona", status: "open" }]);
    expect(result.status).toBe("unidentified");
    expect(result.candidate).toBeUndefined();
  });

  it("marks multiple exact candidates ambiguous unless description disambiguates", () => {
    const result = matchReceivable(base, [
      { id: 1, amount: 250000, customerReference: "PT Rona", status: "open" },
      { id: 2, amount: 250000, customerReference: "CV Saku", status: "open" },
    ]);
    expect(result.status).toBe("matched");
    expect(result.candidate?.id).toBe(1);
    const ambiguous = matchReceivable({ ...base, description: "Transfer masuk" }, [
      { id: 1, amount: 250000, customerReference: "PT Rona", status: "open" },
      { id: 2, amount: 250000, customerReference: "CV Saku", status: "open" },
    ]);
    expect(ambiguous.status).toBe("ambiguous");
  });

  it("normalizes common Moota mutation fields", () => {
    expect(normalizeMootaMutation({ mutation_id: "m-1", nominal: "Rp 125.000", type: "credit", note: "PT Rona" })).toMatchObject({ externalId: "m-1", amount: 125000, type: "credit", description: "PT Rona" });
  });

  it("matches rules case-insensitively and prefers the most specific pattern", () => {
    const result = matchReconciliationRule("Pembelian Beli Bahan Utama", [
      { pattern: "beli", targetCategory: "Belanja", autoConfirm: 0 },
      { pattern: "Beli Bahan", targetCategory: "Bahan baku", autoConfirm: 1 },
    ]);
    expect(result).toMatchObject({ targetCategory: "Bahan baku", autoConfirm: 1 });
  });

  it("returns no rule when the description does not contain a pattern", () => {
    expect(matchReconciliationRule("Transfer pelanggan", [{ pattern: "Tokopedia", targetCategory: "Marketplace", autoConfirm: true }])).toBeUndefined();
  });
});
