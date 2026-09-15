import { describe, expect, it } from "vitest";
import { parseAutomationSchedule } from "./automation-scheduler";

describe("automation schedule parsing", () => {
  it("converts daily WIB phrases to a six-field UTC heartbeat cron", () => {
    expect(parseAutomationSchedule("Setiap pagi jam 8")).toEqual({ cron: "0 0 1 * * *", timezone: "Asia/Jakarta", label: "setiap pagi jam 8 (WIB)" });
  });

  it("supports a weekly Indonesian day and minute", () => {
    expect(parseAutomationSchedule("Setiap Senin jam 08:30")).toEqual({ cron: "0 30 1 * * 1", timezone: "Asia/Jakarta", label: "setiap senin jam 08:30 (WIB)" });
  });

  it("does not schedule event-style triggers as time jobs", () => {
    expect(parseAutomationSchedule("Saat ada perubahan pipeline")).toBeUndefined();
  });
});
