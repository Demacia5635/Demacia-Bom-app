import mongoose from "mongoose";

/**
 * One operation the Chrome extension did against Onshape (e.g. a Refresh BOM
 * or Publish BOM), with how many Onshape requests of each kind it made.
 * Shown on the website's unlisted /tele page to track the Onshape footprint.
 */
const telemetryEventSchema = new mongoose.Schema(
  {
    /** When the operation started. */
    at: { type: Date, required: true, index: true },
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
  },
  { timestamps: false },
);

const TelemetryEvent = mongoose.model("TelemetryEvent", telemetryEventSchema);

export default TelemetryEvent;
