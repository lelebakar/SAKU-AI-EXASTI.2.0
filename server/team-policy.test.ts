import { describe, expect, it } from "vitest";
import { assertToolAllowed, isToolAllowed, resolveTeamPolicy } from "./team-policy";

describe("Saku AI segregation of duties", () => {
  it("allows Dita to manage teams while keeping finance and media tools restricted", () => {
    const policy = resolveTeamPolicy("assistant");
    expect(isToolAllowed(policy, "list_divisions")).toBe(true);
    expect(isToolAllowed(policy, "create_division")).toBe(true);
    expect(isToolAllowed(policy, "update_division")).toBe(true);
    expect(isToolAllowed(policy, "delete_division")).toBe(true);
    expect(isToolAllowed(policy, "recommend_team_structure")).toBe(true);
    expect(isToolAllowed(policy, "record_finance_transaction")).toBe(false);
    expect(isToolAllowed(policy, "generate_image")).toBe(false);
  });

  it("allows finance only to record and export finance work", () => {
    const policy = resolveTeamPolicy("finance");
    expect(isToolAllowed(policy, "record_finance_transaction")).toBe(true);
    expect(isToolAllowed(policy, "export_finance_report")).toBe(true);
    expect(isToolAllowed(policy, "generate_image")).toBe(false);
    expect(isToolAllowed(policy, "create_division")).toBe(false);
  });

  it("allows marketing/design to create visual work but not finance work", () => {
    const policy = resolveTeamPolicy("marketing");
    expect(isToolAllowed(policy, "generate_image")).toBe(true);
    expect(isToolAllowed(policy, "generate_content_package")).toBe(true);
    expect(isToolAllowed(policy, "record_finance_transaction")).toBe(false);
    expect(isToolAllowed(policy, "export_finance_report")).toBe(false);
  });

  it("maps custom divisions to their business-area policy", () => {
    expect(resolveTeamPolicy("custom-design", "Design & Creative").teamKey).toBe("marketing");
    expect(resolveTeamPolicy("custom-books", "Akuntansi").teamKey).toBe("finance");
    expect(resolveTeamPolicy("custom-warehouse", "Inventory").teamKey).toBe("operations");
  });

  it("hard-fails a forbidden tool even if a model attempts to call it", () => {
    expect(() => assertToolAllowed(resolveTeamPolicy("marketing"), "record_finance_transaction")).toThrow("tidak memiliki kewenangan");
    expect(() => assertToolAllowed(resolveTeamPolicy("finance"), "generate_image")).toThrow("tidak memiliki kewenangan");
  });
});
