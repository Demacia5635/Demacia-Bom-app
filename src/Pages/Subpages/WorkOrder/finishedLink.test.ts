import { describe, expect, it } from "vitest";
import { linkFinished } from "./finishedLink";
import { isFinishedRow } from "./useWorkOrderFilters";
import type WorkOrderTableRow from "./WorkOrderTableRow";

const sp = (statusCode: string, Priority: string) => ({ statusCode, Priority });

describe("linkFinished", () => {
  it("finishing by status sets priority Finished, and the reverse", () => {
    expect(linkFinished(sp("In manufacturing", "High"), sp("Finished Manufacturing", "High"), false)).toEqual(sp("Finished Manufacturing", "Finished"));
    expect(linkFinished(sp("In manufacturing", "High"), sp("In manufacturing", "Finished"), false)).toEqual(sp("Finished Manufacturing", "Finished"));
    expect(linkFinished(sp("To buy", "Low"), sp("Finished", "Low"), true)).toEqual(sp("Finished", "Finished"));
    expect(linkFinished(sp("To buy", "Low"), sp("To buy", "Finished"), true)).toEqual(sp("Finished", "Finished"));
  });

  it("un-finishing the status takes the priority off Finished (the reported bug)", () => {
    expect(linkFinished(sp("Finished Manufacturing", "Finished"), sp("In manufacturing", "Finished"), false)).toEqual(sp("In manufacturing", "Medium"));
    expect(linkFinished(sp("Finished", "Finished"), sp("To buy", "Finished"), true)).toEqual(sp("To buy", "Medium"));
  });

  it("un-finishing the priority steps the status back", () => {
    expect(linkFinished(sp("Finished Manufacturing", "Finished"), sp("Finished Manufacturing", "High"), false)).toEqual(sp("In manufacturing", "High"));
    expect(linkFinished(sp("Finished", "Finished"), sp("Finished", "Low"), true)).toEqual(sp("To buy", "Low"));
  });

  it("leaves other edits alone", () => {
    expect(linkFinished(sp("In Planning", "High"), sp("In manufacturing", "High"), false)).toEqual(sp("In manufacturing", "High"));
    expect(linkFinished(sp("In Planning", "High"), sp("In Planning", "Low"), false)).toEqual(sp("In Planning", "Low"));
  });

  it("after un-finishing, the line no longer counts as finished", () => {
    const after = linkFinished(sp("Finished Manufacturing", "Finished"), sp("In Planning", "Finished"), false);
    expect(isFinishedRow({ ...after } as WorkOrderTableRow)).toBe(false);
  });
});
