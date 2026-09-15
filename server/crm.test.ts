import { describe, expect, it } from "vitest";
import { summarizeSakuCrmContacts } from "./db";

describe("CRM contact summaries", () => {
  it("summarizes the active pipeline and near-term follow-ups", () => {
    const now = new Date("2026-09-14T00:00:00.000Z");
    const summary = summarizeSakuCrmContacts([
      { stage: "lead", opportunityValue: 500_000, nextFollowUp: new Date("2026-09-16T00:00:00.000Z") },
      { stage: "proposal", opportunityValue: 1_500_000, nextFollowUp: new Date("2026-09-30T00:00:00.000Z") },
      { stage: "won", opportunityValue: 2_000_000, nextFollowUp: null },
      { stage: "lost", opportunityValue: 700_000, nextFollowUp: new Date("2026-09-15T00:00:00.000Z") },
    ], now);
    expect(summary.stageCounts).toEqual({ lead: 1, qualified: 0, proposal: 1, won: 1, lost: 1 });
    expect(summary.pipelineValue).toBe(2_000_000);
    expect(summary.wonValue).toBe(2_000_000);
    expect(summary.followUpsDue).toBe(1);
  });
});
