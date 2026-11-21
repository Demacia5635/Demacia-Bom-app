/**
 * Shared helpers for the POST /id/:id upsert routes (parts, BOMs, work orders).
 */
import type { Request } from "express";
import type { Model } from "mongoose";

/** Fields the server owns: never taken from a request body. */
const SERVER_OWNED = new Set(["_id", "__v", "id", "createdAt", "updatedAt", "updatedBy"]);

/**
 * The request body as plain field values for a `$set`. Mongoose already drops
 * fields the schema doesn't know, but not:
 * - keys starting with "$": passed straight into the update, they run as
 *   MongoDB operators ({"$unset": ...}, {"$rename": ...});
 * - dotted keys ("parts.0.partID"), which write inside nested documents;
 * - server-owned fields (ids and timestamps).
 */
export function cleanUpdateBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== "object" || Array.isArray(body)) return {};
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
        if (key.startsWith("$") || key.includes(".") || SERVER_OWNED.has(key)) continue;
        clean[key] = value;
    }
    return clean;
}

/**
 * Who made this change, from the X-Updated-By header: the Onshape user name
 * (extension) or "website", URL-encoded (encodeURIComponent), since header
 * values can't carry Hebrew. { updatedBy } to spread into a $set, or {} when
 * the header is missing (the saved value stays). The header isn't checked
 * against anything, so this is a convenience, not an audit trail.
 */
export function updatedByOf(req: Request): { updatedBy?: string } {
    const raw = req.get("X-Updated-By");
    if (!raw) return {};
    let decoded = raw;
    try {
        decoded = decodeURIComponent(raw);
    } catch {
        // Not URL-encoded: use it as sent.
    }
    const value = decoded.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100);
    return value ? { updatedBy: value } : {};
}

/** MongoDB's duplicate-key error. */
export function isDuplicateKeyError(err: unknown): boolean {
    return (err as { code?: number } | null)?.code === 11000;
}

/**
 * Runs an upsert, retrying once on a duplicate-key error. Two first-time saves
 * of the same id at the same moment can both try to insert; the loser fails
 * with E11000, and on retry it finds the record and updates it.
 */
export async function upsertWithRetry<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (err) {
        if (!isDuplicateKeyError(err)) throw err;
        return await run();
    }
}

/**
 * Upserts the record with this id and says whether this request created it.
 * That comes from the same write (MongoDB's updatedExisting), so two
 * first-time saves can't both answer 201, as a findOne beforehand allowed.
 */
export async function upsertByID(
    model: Model<any>,
    id: string,
    update: Record<string, unknown>,
): Promise<{ doc: unknown; created: boolean }> {
    const result = await upsertWithRetry(() => model.findOneAndUpdate(
        { id },
        update,
        {
            returnDocument: "after",
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
            includeResultMetadata: true,
        },
    ));
    return { doc: result.value, created: !result.lastErrorObject?.updatedExisting };
}
