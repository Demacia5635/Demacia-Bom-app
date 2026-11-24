/**
 * A part's revision: a whole number the server keeps (the user's rules).
 * - A made part starts at 1, and every save that changes its data in any way
 *   (from Publish or from the website) adds 1. A save that changes nothing
 *   keeps it.
 * - Standard parts (Standard Content, marked standard, or with a vendor) have
 *   no revision. A part that stops being standard starts again at 1.
 * - It's set only here: a `revision` in a request body is ignored.
 * What counts as "its data" is COUNTED_FIELDS, the one place to change it
 * (e.g. to add a per-part geometry marker from Onshape later).
 */

type Rec = Record<string, any>;

/**
 * The fields whose change bumps the revision. Geometry is followed through
 * size (the bounding box) and mass, which Publish re-reads after a geometry
 * edit. Not counted: ids, timestamps, updatedBy, Onshape links, the Drive file
 * IDs and filesModelVersion (re-exports change them for a whole Part Studio),
 * and the standard flags (they decide whether there is a revision at all).
 */
export const COUNTED_FIELDS = [
    "name", "catalogNumber", "description", "material", "engineer", "comments", "vendor",
    "price", "mass", "size", "wantStl", "wantParasolid",
] as const;

/** Bought, not made: no revision. */
export const isStandardPart = (part: Rec | null | undefined) =>
    !!part?.isStandardContent || !!part?.markedStandard || (typeof part?.vendor === "string" && part.vendor.trim() !== "");

/** A value as compared: blank / missing are the same, numbers and numeric text are the same. */
function normal(value: unknown): unknown {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") {
        const text = value.trim();
        return text !== "" && !Number.isNaN(Number(text)) ? Number(text) : text;
    }
    if (typeof value === "object") return JSON.stringify(value);
    return value;
}

/** The counted fields the incoming save changes (only fields it sends are compared). */
export function changedFields(stored: Rec, incoming: Rec): string[] {
    return COUNTED_FIELDS.filter((field) => field in incoming && normal(incoming[field]) !== normal(stored[field]));
}

/**
 * The revision part of a part save's update, from the stored record (null
 * for a new part) and the fields being saved: { $set }, { $inc } or { $unset }.
 * A bump uses $inc, so two saves at the same moment both count.
 */
export function revisionUpdate(stored: Rec | null, incoming: Rec): { $set?: Rec; $inc?: Rec; $unset?: Rec } {
    const after = { ...(stored ?? {}), ...incoming };
    if (isStandardPart(after)) return stored && stored.revision !== undefined ? { $unset: { revision: "" } } : {};
    // New, or coming back from standard: start at 1.
    if (!stored || isStandardPart(stored)) return { $set: { revision: 1 } };
    const changed = changedFields(stored, incoming).length > 0;
    // Saved before revisions existed (none, or an old manual value): it's
    // revision 1, so a change makes it 2.
    if (!Number.isInteger(stored.revision)) return { $set: { revision: changed ? 2 : 1 } };
    return changed ? { $inc: { revision: 1 } } : {};
}
