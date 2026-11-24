import { describe, expect, it } from "vitest";
import { commonErrors, compareVersions, publishStats, versionsInUse, type StatsEvent } from "./extensionStats";

const ev = (over: Partial<StatsEvent>): StatsEvent => ({ at: "2026-11-24T10:00:00Z", action: "Refresh BOM", ok: true, ...over });

describe("compareVersions", () => {
  it("compares numerically", () => {
    expect(compareVersions("5.10.0", "5.9.9")).toBe(1);
    expect(compareVersions("5.0.0", "5.0")).toBe(0);
    expect(compareVersions("4.2.1", "5.0.0")).toBe(-1);
  });
});

describe("versionsInUse", () => {
  it("takes each user's newest event, groups by version and browser, newest version first", () => {
    const rows = versionsInUse([
      ev({ user: "noa", version: "5.0.0", at: "2026-11-01T00:00:00Z" }),
      ev({ user: "noa", version: "5.1.0", at: "2026-11-20T00:00:00Z", browser: "chrome" }),
      ev({ user: "amit", version: "5.0.0", at: "2026-11-21T00:00:00Z", browser: "firefox" }),
      ev({ user: "dana" }),
    ]);
    expect(rows.map((r) => [r.version, r.browser, r.users.join(","), r.latest])).toEqual([
      ["5.1.0", "chrome", "noa", true],
      ["5.0.0", "firefox", "amit", false],
      ["?", "", "dana", false],
    ]);
  });
});

describe("publishStats", () => {
  it("counts success, average time and time per item over Publish BOM only", () => {
    const s = publishStats([
      ev({ action: "Publish BOM", ok: true, durationMs: 4000, items: 10 }),
      ev({ action: "Publish BOM", ok: true, durationMs: 2000, problems: 1 }),
      ev({ action: "Publish BOM", ok: false, durationMs: 9000 }),
      ev({ action: "Refresh BOM", ok: false }),
    ]);
    expect(s).toEqual({ total: 3, ok: 2, successRate: 2 / 3, avgMs: 3000, msPerItem: 400, withProblems: 1 });
  });

  it("is empty with no publishes", () => {
    expect(publishStats([]).successRate).toBeNull();
  });
});

describe("commonErrors", () => {
  it("groups failures by code, else text, else 'no code', most frequent first", () => {
    const rows = commonErrors([
      ev({ ok: false, errorCode: "ONSHAPE_429", error: "Too many requests", at: "2026-11-02T00:00:00Z" }),
      ev({ ok: false, errorCode: "ONSHAPE_429", at: "2026-11-05T00:00:00Z", action: "Publish BOM" }),
      ev({ ok: false, error: "Network down" }),
      ev({ ok: false }),
      ev({ ok: true, errorCode: "IGNORED" }),
    ]);
    expect(rows.map((r) => [r.key, r.count])).toEqual([
      ["ONSHAPE_429", 2],
      ["Network down", 1],
      ["No code (older version)", 1],
    ]);
    expect(rows[0]).toMatchObject({ coded: true, lastAt: "2026-11-05T00:00:00Z", example: "Too many requests", actions: ["Refresh BOM", "Publish BOM"] });
  });
});
