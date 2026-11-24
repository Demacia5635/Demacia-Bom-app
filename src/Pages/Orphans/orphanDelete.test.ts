import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../util/ApiService";
import { adminErrorMessage, chunks, deleteOrphans } from "./orphanDelete";

describe("chunks", () => {
  it("splits into batches of 200 in order", () => {
    const ids = Array.from({ length: 450 }, (_, i) => `p${i}`);
    expect(chunks(ids).map((c) => c.length)).toEqual([200, 200, 50]);
    expect(chunks(ids)[2][0]).toBe("p400");
    expect(chunks([])).toEqual([]);
  });
});

describe("adminErrorMessage", () => {
  it("names a wrong secret, the lock-out, and other failures", () => {
    expect(adminErrorMessage(new ApiRequestError("Not found", 404))).toBe("Wrong admin secret.");
    expect(adminErrorMessage(new ApiRequestError("Too many wrong admin secrets. Try again in 15 minutes.", 429))).toBe(
      "Too many wrong admin secrets. Try again in 15 minutes."
    );
    expect(adminErrorMessage(new ApiRequestError("Boom", 500))).toBe("Couldn't delete: Boom");
  });
});

describe("deleteOrphans", () => {
  const calls: string[][] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubEnv("VITE_CLIENT_SECRET", "test");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /** Each batch: deletes every id except "used", refuses that one; `failAt` (batch index) answers `status`. */
  function server(failAt = -1, status = 404) {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const ids: string[] = JSON.parse(String(init.body)).ids;
      calls.push(ids);
      if (calls.length - 1 === failAt) return new Response(JSON.stringify({ message: "nope" }), { status });
      const body = {
        deleted: ids.filter((i) => i !== "used").map((id) => ({ id, filesTrashed: ["f"] })),
        refused: ids.filter((i) => i === "used").map((id) => ({ id, reason: "is used by assembly Robot (b1)" })),
      };
      return new Response(JSON.stringify(body), { status: 200 });
    }));
  }

  it("sends 200 at a time and gathers deleted and refused", async () => {
    server();
    const ids = [...Array.from({ length: 249 }, (_, i) => `p${i}`), "used"];
    const progress: number[] = [];
    const out = await deleteOrphans(ids, "s", (done) => progress.push(done));
    expect(calls.map((c) => c.length)).toEqual([200, 50]);
    expect(out.deleted.size).toBe(249);
    expect(out.refused.get("used")).toBe("is used by assembly Robot (b1)");
    expect(out.stopped).toBeNull();
    expect(progress).toEqual([0, 200, 250]);
  });

  it("stops at a wrong secret, keeping what an earlier batch deleted", async () => {
    server(1, 404);
    const out = await deleteOrphans(Array.from({ length: 450 }, (_, i) => `p${i}`), "s");
    expect(calls).toHaveLength(2);
    expect(out.deleted.size).toBe(200);
    expect(out.stopped).toBe("Wrong admin secret.");
  });
});
