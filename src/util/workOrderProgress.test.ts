import { describe, expect, it } from "vitest";
import { progressOfLines, progressOfSummary } from "./workOrderProgress";

describe("progressOfLines", () => {
  it("counts made and bought lines, leaving Untracked out", () => {
    const p = progressOfLines([
      { statusCode: "Finished Manufacturing", Priority: "Finished" },
      { statusCode: "In manufacturing", Priority: "High" },
      { statusCode: "Finished", Priority: "Finished" }, // bought, finished
      { statusCode: "To buy", Priority: "Medium" }, // bought, not yet
      { statusCode: "Untracked", Priority: "Medium" }, // not followed
    ]);
    expect(p).toEqual({ finished: 2, total: 4, percent: 50 });
  });

  it("is 100% with nothing to follow", () => {
    expect(progressOfLines([{ statusCode: "Untracked" }])).toEqual({ finished: 0, total: 0, percent: 100 });
  });
});

describe("progressOfSummary", () => {
  it("uses the server's progress when it sends one", () => {
    expect(progressOfSummary({ progress: { finished: 43, total: 46, percent: 93 }, madeParts: 26, finishedParts: 24 })).toEqual({ finished: 43, total: 46, percent: 93 });
  });

  it("works the same numbers out of the older fields", () => {
    expect(progressOfSummary({ madeParts: 26, finishedParts: 24, purchased: { lines: 22, toBuy: 3, finished: 19, untracked: 2 } })).toEqual({ finished: 43, total: 46, percent: 93 });
    expect(progressOfSummary({})).toEqual({ finished: 0, total: 0, percent: 100 });
  });
});
