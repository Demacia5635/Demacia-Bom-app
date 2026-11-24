import mongoose from "mongoose";

/**
 * One operation the Chrome extension did against Onshape (e.g. a Refresh BOM
 * or Publish BOM), with how many Onshape requests of each kind it made.
 * Shown on the website's unlisted /tele page to track the Onshape footprint.
 */
const telemetryEventSchema = new mongoose.Schema(
  {
    /** When the operation started. Indexed below (and expires after TELEMETRY_TTL_SECONDS). */
    at: { type: Date, required: true },
    /** Onshape account name (or email) of the person using the extension. */
    user: { type: String, default: "", index: true },
    /** e.g. "Refresh BOM", "Publish BOM", "Image loads", "Sign-in check". */
    action: { type: String, required: true },
    /** Assembly name, when known. */
    assembly: { type: String, default: "" },
    documentID: { type: String, default: "" },
    elementID: { type: String, default: "" },
    /** Onshape requests by kind: bom, metadataRead, metadataWrite, render, stl, parasolid, session, other. */
    counts: { type: Map, of: Number, default: {} },
    /** Total Onshape requests in the operation. */
    total: { type: Number, default: 0 },
    /** Onshape requests that failed. */
    failed: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    ok: { type: Boolean, default: true },
    error: { type: String, default: "" },
    /** Extension version that sent it. */
    version: { type: String, default: "" },
    /** Why it failed, as a stable code (CATALOG_NUMBER_TAKEN, HTTP_500, ONSHAPE_429, ...); "" on success. */
    errorCode: { type: String, default: "" },
    /** How many items the operation handled (Publish: the top assembly + each distinct item). */
    items: { type: Number },
    /** Non-fatal problems in a successful operation (e.g. a failed thumbnail). */
    problems: { type: Number },
    /** "chrome" or "firefox". */
    browser: { type: String, default: "" },
  },
  { timestamps: false },
);

/** Entries are deleted by MongoDB about 6 months after they happened. */
export const TELEMETRY_TTL_SECONDS = 180 * 24 * 60 * 60;

telemetryEventSchema.index({ at: 1 }, { expireAfterSeconds: TELEMETRY_TTL_SECONDS });

const TelemetryEvent = mongoose.model("TelemetryEvent", telemetryEventSchema);

/**
 * Databases created before the TTL existed already have a plain `at` index, so
 * Mongoose's automatic index build fails with IndexOptionsConflict. Turn that
 * existing index into the TTL index instead (or rebuild it if that's refused).
 */
TelemetryEvent.on("index", async (err?: { code?: number; codeName?: string }) => {
  if (!err || (err.code !== 85 && err.codeName !== "IndexOptionsConflict")) {
    if (err) console.error("Telemetry index build failed:", err);
    return;
  }
  const collection = TelemetryEvent.collection;
  try {
    await collection.db.command({
      collMod: collection.collectionName,
      index: { keyPattern: { at: 1 }, expireAfterSeconds: TELEMETRY_TTL_SECONDS },
    });
    console.log("Telemetry: entries now expire after 180 days");
  } catch (collModError) {
    try {
      await collection.dropIndex("at_1");
      await collection.createIndex({ at: 1 }, { expireAfterSeconds: TELEMETRY_TTL_SECONDS });
      console.log("Telemetry: rebuilt the at index to expire entries after 180 days");
    } catch (rebuildError) {
      console.error("Telemetry: could not add the 180-day expiry:", collModError, rebuildError);
    }
  }
});

export default TelemetryEvent;
