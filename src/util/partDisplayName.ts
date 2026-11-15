/**
 * The name the website shows for a saved part or BOM record.
 *
 * The saved name is used whenever it's a real name. The old pages rejected
 * any name of 50+ characters or with an underscore, to catch records whose
 * "name" was a raw compound id; a real vendor name like
 * `1/2" Hex Clamping Shaft Collar (Heavy Duty, Purple)` (51 characters) then
 * showed as "Part JJD". Only an actual id is rejected now.
 */

/** Onshape object ids are 24 hex characters. */
const ONSHAPE_ID = "[0-9a-f]{24}";
/**
 * Compound record ids the extension saves: document_wvmType_wvm_element for an
 * assembly, plus _partId for a part (partId is short, e.g. "JJD").
 */
const COMPOUND_ID = new RegExp(`^${ONSHAPE_ID}_[wvm]_${ONSHAPE_ID}_${ONSHAPE_ID}(_[^\\s]+)?$`, "i");

/** True when `text` is a record id rather than a name. */
export function looksLikeRecordId(text: string, ...ids: (string | undefined)[]): boolean {
    const t = text.trim();
    return COMPOUND_ID.test(t) || ids.some((id) => !!id && t === id);
}

const usable = (value: unknown, ...ids: (string | undefined)[]): value is string =>
    typeof value === "string" && value.trim() !== "" && !looksLikeRecordId(value, ...ids);

/**
 * `record`: the saved part or BOM (any shape; older records had other name
 * fields). `entityID`: the id the parent BOM links it by.
 */
export function partDisplayName(record: any, entityID: string): string {
    const ids = [entityID, record?.id];
    if (usable(record?.name, ...ids)) return record.name.trim();

    // No usable name: the old fallbacks.
    for (const value of [record?.title, record?.partName, record?.fileName, record?.properties?.name, record?.metadata?.name]) {
        if (usable(value, ...ids)) return value.trim();
    }
    if (usable(record?.catalogNumber, ...ids)) return record.catalogNumber.trim();
    if (usable(record?.description, ...ids) && record.description.length < 50) return record.description.trim();

    // Only an id: show its last part (Onshape's part id) rather than the whole thing.
    if (entityID && entityID.includes("_")) {
        const segments = entityID.split("_");
        return `Part ${segments[segments.length - 1]}`;
    }
    return entityID;
}
