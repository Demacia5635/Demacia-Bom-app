import { describe, expect, it } from "vitest";
import { statsFromEvents } from "./telemetryStats";

describe("statsFromEvents", () => {
  it("totals per Israel-time day and per user, users with most requests first", () => {
    const stats = statsFromEvents([
      // 23:30 UTC on the 1st is already the 2nd in Israel
      { at: "2026-11-01T23:30:00Z", user: "Dana", counts: { bom: 3, render: 2 }, failed: 1, ok: false },
      { at: "2026-11-02T08:00:00Z", user: "Dana", counts: { bom: 1 }, failed: 0, ok: true },
      { at: "2026-11-03T08:00:00Z", user: "", counts: { stl: 10 }, failed: 0, ok: true },
    ]);
    expect(stats.days).toEqual([
      { day: "2026-11-02", events: 2, requests: 6, failed: 1, failedEvents: 1, byKind: { bom: 4, render: 2 } },
      { day: "2026-11-03", events: 1, requests: 10, failed: 0, failedEvents: 0, byKind: { stl: 10 } },
    ]);
    expect(stats.users.map((u) => [u.user, u.requests])).toEqual([["", 10], ["Dana", 6]]);
  });
});
