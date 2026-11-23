import { describe, expect, it } from "vitest";
import { boughtStatus, madeStatus } from "./workOrderOptions";

describe("boughtStatus", () => {
  it("keeps the bought list's own values", () => {
    expect(boughtStatus("Untracked")).toBe("Untracked");
    expect(boughtStatus("To buy")).toBe("To buy");
    expect(boughtStatus("Finished")).toBe("Finished");
  });

  it("maps stored manufacturing statuses: finished is Finished, the rest To buy", () => {
    expect(boughtStatus("Finished Manufacturing")).toBe("Finished");
    expect(boughtStatus("In Planning", "Finished")).toBe("Finished");
    expect(boughtStatus("Untracked", "Finished")).toBe("Finished");
    expect(boughtStatus("In Planning", "Medium")).toBe("To buy");
    expect(boughtStatus("CATNUM Written")).toBe("To buy");
  });
});

describe("madeStatus", () => {
  it("turns a bought status back into the nearest made one", () => {
    expect(madeStatus("Finished")).toBe("Finished Manufacturing");
    expect(madeStatus("To buy")).toBe("In Planning");
    expect(madeStatus("Untracked")).toBe("Untracked");
  });
});
