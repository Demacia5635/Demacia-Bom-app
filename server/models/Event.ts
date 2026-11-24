import mongoose from "mongoose";

/**
 * What happened, for the website's #/activity and #/revisions pages: saves,
 * revision bumps, publishes, deletes, Drive sorts and cleanups (the user
 * approved this collection). Capped: MongoDB keeps the last 5000 events and
 * drops the oldest by itself.
 */
const eventSchema = new mongoose.Schema(
    {
        at: { type: Date, default: () => new Date() },
        /** e.g. "part.revision", "bom.publish", "workOrder.part" (services/events.ts). */
        kind: { type: String, required: true },
        /** Who did it (X-Updated-By), when known. */
        who: { type: String },
        /** The record it's about. */
        record: {
            kind: { type: String },
            id: { type: String },
            name: { type: String },
        },
        /** One line ready to show. */
        message: { type: String, required: true },
        /** Kind-specific facts, e.g. { from, to, fields } for a revision bump. */
        details: { type: mongoose.Schema.Types.Mixed },
    },
    { capped: { size: 5 * 1024 * 1024, max: 5000 }, versionKey: false },
);
eventSchema.index({ kind: 1, _id: -1 });

const Event = mongoose.model("Event", eventSchema);

export default Event;
