import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../util/ApiService";
import { describePublishError, explainPublishError } from "./publishErrors";

const withCode = (message: string, status: number, code: string) => new ApiRequestError(message, status, { code });

describe("explainPublishError: our server", () => {
  it("says the server couldn't be reached when a request got no answer", () => {
    expect(explainPublishError(new ApiRequestError("Failed to fetch")).cause).toMatch(/could not be reached/);
    expect(explainPublishError({ message: "Network error occurred." }).cause).toMatch(/could not be reached/);
  });

  it("keeps a bug in the extension apart from an unreachable server", () => {
    expect(explainPublishError(new TypeError("x is undefined")).cause).toBe("Something went wrong in the extension.");
  });

  it("explains refused keys, missing records, a concurrent save, bad values and server errors", () => {
    expect(explainPublishError(new ApiRequestError("no", 401)).cause).toMatch(/access key/);
    expect(explainPublishError(new ApiRequestError("no", 404)).next).toMatch(/Refresh BOM/);
    expect(explainPublishError(new ApiRequestError("dup", 409)).cause).toMatch(/same moment/);
    expect(explainPublishError(new ApiRequestError("bad", 400)).cause).toMatch(/isn't valid/);
    expect(explainPublishError(new ApiRequestError("boom", 500)).cause).toMatch(/failed while saving \(500\)/);
  });

  it("shows the server's own words for its three refusals, by code or by wording", () => {
    const elsewhere = "X (Arm) was already published from another workspace or version of this Onshape document. Nothing was saved.";
    const taken = 'Catalog number 2714-1000 is already used by another assembly, "Arm". Nothing was saved.';
    const name = '"Gripper" and "Gripper" have the same name. Give them catalog numbers in Onshape, then publish again.';
    for (const [err, code] of [
      [withCode(elsewhere, 409, "ASSEMBLY_PUBLISHED_ELSEWHERE"), "ASSEMBLY_PUBLISHED_ELSEWHERE"],
      [new ApiRequestError(taken, 409), "CATALOG_NUMBER_TAKEN"],
      [withCode(name, 409, "ASSEMBLY_NAME_TAKEN"), "ASSEMBLY_NAME_TAKEN"],
    ] as const) {
      const x = explainPublishError(err);
      expect(x.cause).toBe(err.message);
      expect(x.next).toBe("");
      expect(x.detail).toBe(code);
    }
  });
});

describe("explainPublishError: Onshape", () => {
  const onshape = (status: number) => ({ source: "onshape", onshapeStatus: status, statusCode: status, message: "m" });
  it("tells unreachable, no permission, not found and rate limited apart", () => {
    expect(explainPublishError(onshape(0)).cause).toBe("Onshape could not be reached.");
    expect(explainPublishError(onshape(403)).cause).toMatch(/no permission/);
    expect(explainPublishError(onshape(404)).next).toMatch(/Refresh BOM/);
    expect(explainPublishError(onshape(429)).cause).toMatch(/limiting/);
    expect(explainPublishError(onshape(502)).cause).toBe("Onshape returned an error (502).");
  });
});

describe("describePublishError", () => {
  it("is one line: cause, next step, details", () => {
    expect(describePublishError(new ApiRequestError("boom", 500))).toBe(
      "The BOM server failed while saving (500). Press Publish BOM again to retry. If it keeps failing, tell the team. (Details: boom)"
    );
  });

  it("has no empty next step for the server's refusals", () => {
    expect(describePublishError(withCode("Taken. Nothing was saved.", 409, "CATALOG_NUMBER_TAKEN"))).toBe(
      "Taken. Nothing was saved. (Details: CATALOG_NUMBER_TAKEN)"
    );
  });
});
