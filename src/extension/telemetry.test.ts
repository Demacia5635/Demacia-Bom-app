import { afterEach, describe, expect, it, vi } from "vitest";

// telemetry.ts listens for the page closing when it loads: give it a stand-in.
(globalThis as { addEventListener?: unknown }).addEventListener ??= () => {};
const { errorCodeOf, flush, recordOnshapeCall, reportOperation, withOperation } = await import("./telemetry");
const { ApiRequestError } = await import("../util/ApiService");

describe("errorCodeOf", () => {
  it("uses the server's own code, else the HTTP status", () => {
    expect(errorCodeOf(new ApiRequestError("taken", 409, { code: "CATALOG_NUMBER_TAKEN" }))).toBe("CATALOG_NUMBER_TAKEN");
    expect(errorCodeOf(new ApiRequestError("boom", 500))).toBe("HTTP_500");
  });

  it("tells an unreachable server, Onshape, a replaced load and a bug apart", () => {
    expect(errorCodeOf(new ApiRequestError("Failed to fetch"))).toBe("SERVER_UNREACHABLE");
    expect(errorCodeOf({ message: "Network error occurred." })).toBe("SERVER_UNREACHABLE");
    expect(errorCodeOf({ source: "onshape", onshapeStatus: 403 })).toBe("ONSHAPE_403");
    expect(errorCodeOf({ source: "onshape", onshapeStatus: 0 })).toBe("ONSHAPE_UNREACHABLE");
    expect(errorCodeOf({ cancelled: true, message: "replaced" })).toBe("CANCELLED");
    expect(errorCodeOf(new TypeError("x is undefined"))).toBe("EXTENSION_ERROR");
  });
});

describe("withOperation events", () => {
  const sent: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    sent.push(...JSON.parse(init.body).events);
    return { ok: true, status: 200 };
  });
  afterEach(() => {
    sent.length = 0;
  });

  it("records a failure the operation reported without throwing", async () => {
    await withOperation("Publish BOM", async () => {
      recordOnshapeCall("GET", "/api/assemblies/d/x/w/y/e/z/bom");
      reportOperation({ failed: true, errorCode: "NEWER_PUBLISHED", error: "Not published: …", items: 12 });
      return null;
    });
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ action: "Publish BOM", ok: false, errorCode: "NEWER_PUBLISHED", error: "Not published: …", items: 12, browser: "chrome" });
  });

  it("records items and problems on success, with no error code", async () => {
    await withOperation("Publish BOM", async () => {
      recordOnshapeCall("POST", "/api/metadata/d/x/w/y/e/z/p/JHD");
      reportOperation({ items: 5, problems: 1 });
      return true;
    });
    await flush();
    expect(sent[0]).toMatchObject({ ok: true, items: 5, problems: 1 });
    expect(sent[0]).not.toHaveProperty("errorCode");
  });

  it("codes a thrown error", async () => {
    await expect(
      withOperation("Refresh BOM", async () => {
        throw new ApiRequestError("boom", 502);
      })
    ).rejects.toThrow("boom");
    await flush();
    expect(sent[0]).toMatchObject({ action: "Refresh BOM", ok: false, error: "boom", errorCode: "HTTP_502" });
  });
});
