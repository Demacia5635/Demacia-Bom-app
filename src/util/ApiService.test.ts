import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, fetchFromApi } from "./ApiService";

/** fetch answers once with this status and JSON body. */
function replyWith(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })));
}

async function errorOf(promise: Promise<unknown>): Promise<ApiRequestError> {
  try {
    await promise;
  } catch (err) {
    return err as ApiRequestError;
  }
  throw new Error("expected the request to fail");
}

describe("fetchFromApi errors", () => {
  beforeEach(() => vi.stubEnv("VITE_CLIENT_SECRET", "test-secret"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("carries the server's code, requestId and fields (QS6's error shape)", async () => {
    replyWith(409, { code: "CONFLICT", message: "Catalog number 5635-25-100 is already used", fields: { catalogNumber: "taken" }, requestId: "req-1" });
    const err = await errorOf(fetchFromApi("/db/part/id/p1", { method: "PUT", body: "{}" }));
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe("Catalog number 5635-25-100 is already used");
    expect(err.code).toBe("CONFLICT");
    expect(err.requestId).toBe("req-1");
    expect(err.fields).toEqual({ catalogNumber: "taken" });
  });

  it("works as before for an error reply without them (an older server)", async () => {
    replyWith(409, { message: "Edited elsewhere" });
    const err = await errorOf(fetchFromApi("/db/part/id/p1", { method: "PUT", body: "{}" }));
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe("Edited elsewhere");
    expect(err.code).toBeUndefined();
    expect(err.requestId).toBeUndefined();
  });

  it("ignores values of the wrong type", async () => {
    replyWith(500, { code: 42, requestId: ["x"], fields: "nope", message: "Boom" });
    const err = await errorOf(fetchFromApi("/db/bom/all"));
    expect(err.code).toBeUndefined();
    expect(err.requestId).toBeUndefined();
    expect(err.fields).toBeUndefined();
    expect(err.message).toBe("Boom");
  });
});
