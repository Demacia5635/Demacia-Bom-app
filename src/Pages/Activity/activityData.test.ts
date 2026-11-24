import { describe, expect, it } from "vitest";
import { matchesEvent, mergeNewest, recordLink, timeAgo, type ActivityEvent } from "./activityData";

const ev = (id: string, over: Partial<ActivityEvent> = {}): ActivityEvent => ({ id, at: "2026-11-24T10:00:00Z", kind: "part.revision", message: `m${id}`, ...over });

describe("timeAgo", () => {
  const now = new Date("2026-11-24T12:00:00Z").getTime();
  it("is relative, then a date", () => {
    expect(timeAgo("2026-11-24T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-11-24T11:50:00Z", now)).toBe("10 min ago");
    expect(timeAgo("2026-11-24T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-11-22T12:00:00Z", now)).toBe("2 days ago");
    expect(timeAgo("2026-11-01T12:00:00Z", now)).toBe("01/11/2026");
  });
});

describe("mergeNewest", () => {
  it("puts new events on top, each once", () => {
    expect(mergeNewest([ev("3"), ev("2")], [ev("2"), ev("1")]).map((e) => e.id)).toEqual(["3", "2", "1"]);
  });
});

describe("matchesEvent", () => {
  it("filters by person and by text in the message or record name", () => {
    const e = ev("1", { who: "Noa", message: "Noa published Chassis", record: { kind: "bom", id: "b1", name: "Chassis" } });
    expect(matchesEvent(e, "", "")).toBe(true);
    expect(matchesEvent(e, "Noa", "chassis")).toBe(true);
    expect(matchesEvent(e, "Amit", "")).toBe(false);
    expect(matchesEvent(e, "", "intake")).toBe(false);
  });
});

describe("recordLink", () => {
  it("opens parts, BOMs and work orders", () => {
    expect(recordLink({ kind: "part", id: "p 1" })).toBe("/partSearch?part=p%201");
    expect(recordLink({ kind: "bom", id: "b1" })).toBe("/bom/b1");
    expect(recordLink({ kind: "workOrder", id: "w1" })).toBe("/workOrder/w1");
    expect(recordLink(undefined)).toBeNull();
  });
});
