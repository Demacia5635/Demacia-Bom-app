import { describe, expect, it } from "vitest";
import { healthSections, titleFromCode, type HealthReply } from "./healthGroups";

const reply: HealthReply = {
  generatedAt: "2026-11-23T10:00:00Z",
  codeTitles: { MISSING_MATERIAL: "Missing material", PART_MISSING: "Part not saved" },
  problems: [
    { code: "CATALOG_NUMBER_INVALID", severity: "warning", message: "5635-25-1 is too short", records: [{ kind: "part", id: "p1", name: "Bracket" }] },
    { code: "MISSING_MATERIAL", severity: "warning", message: "Needs a material.", records: [{ kind: "part", id: "p2", name: "Plate", parents: [{ id: "b1", name: "Intake" }] }] },
    { code: "MISSING_MATERIAL", severity: "warning", message: "Needs a material.", records: [{ kind: "part", id: "p3", name: "Spacer", catalogNumber: "5635-25-103" }] },
    { code: "PART_MISSING", severity: "error", message: "Listed but not saved", records: [{ kind: "part", id: "gone", parents: [{ id: "b2", name: "Climber" }] }] },
  ],
};

describe("healthSections", () => {
  it("groups by code, errors first, keeping the server's order otherwise", () => {
    const sections = healthSections(reply);
    expect(sections.map((s) => s.code)).toEqual(["PART_MISSING", "CATALOG_NUMBER_INVALID", "MISSING_MATERIAL"]);
    expect(sections.map((s) => s.title)).toEqual(["Part not saved", "Catalog number invalid", "Missing material"]);
    expect(sections[2].problems).toHaveLength(2);
  });

  it("shows a message shared by the whole section once", () => {
    const sections = healthSections(reply);
    expect(sections.find((s) => s.code === "MISSING_MATERIAL")!.sharedMessage).toBe("Needs a material.");
    expect(sections.find((s) => s.code === "PART_MISSING")!.sharedMessage).toBeNull(); // a single problem keeps its own
  });

  it("filters by message, record and parent names and catalog numbers", () => {
    expect(healthSections(reply, "spacer").flatMap((s) => s.problems.map((p) => p.records[0].id))).toEqual(["p3"]);
    expect(healthSections(reply, "INTAKE").flatMap((s) => s.problems.map((p) => p.records[0].id))).toEqual(["p2"]);
    expect(healthSections(reply, "5635-25-1").map((s) => s.code)).toEqual(["CATALOG_NUMBER_INVALID", "MISSING_MATERIAL"]);
    expect(healthSections(reply, "nothing like this")).toEqual([]);
  });

  it("keeps the shared message when the filter leaves one problem", () => {
    expect(healthSections(reply, "spacer")[0].sharedMessage).toBeNull();
  });
});

describe("titleFromCode", () => {
  it("turns a code into words", () => {
    expect(titleFromCode("ASSEMBLY_IN_TWO_WORKSPACES")).toBe("Assembly in two workspaces");
  });
});
