/**
 * Assemblies must have folder names that can't clash in the sorted Drive
 * folders (services/driveOrganizer.ts), where an assembly's folder is named by
 * its catalog number, or by its name when it has none. The user's rules:
 * - an Onshape assembly's BOM is kept for one workspace/version only: the same
 *   assembly (document + element) published from another one is refused;
 * - a non-empty catalog number belongs to one assembly in the whole database;
 * - BOMs without a catalog number in the same parent need different names.
 * Saving a BOM that breaks one is refused (409) and nothing is saved; the dry
 * run of the Drive sort lists the existing clashes so they can be fixed first.
 */
import Bom from "../models/Bom";

type BomRecord = Record<string, any>;

const label = (bom: BomRecord) => `${bom.name || bom.id} (${bom.id})`;

/** Where an assembly is in Onshape. */
export interface OnshapeKey {
    documentID: string;
    wvmType: string;
    wvmID: string;
    elementID: string;
}

/** A refused save: the 409 reply's body. */
export interface BomClash {
    code: "CATALOG_NUMBER_TAKEN" | "ASSEMBLY_NAME_TAKEN" | "ASSEMBLY_PUBLISHED_ELSEWHERE";
    message: string;
    fields: string[];
    /** The other assembly record that has the catalog number, name or Onshape assembly. */
    conflictsWith: { id: string; name?: string };
    /** ASSEMBLY_PUBLISHED_ELSEWHERE: where it was published (the record's Onshape key and link). */
    publishedFrom?: OnshapeKey & { onshapeURL: string };
}
const trimmed = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** A BOM ID is documentID_wvmType_wvmID_elementID_bomID (Onshape IDs are 24 hex digits). */
const COMPOUND_ID = /^([0-9a-f]{24})_([wvm])_([0-9a-f]{24})_([0-9a-f]{24})_/;

/** A BOM record's Onshape key: its onshapeID, or read from its ID. */
export function onshapeKeyOf(record: BomRecord | null | undefined, id = record?.id): OnshapeKey | null {
    const stored = record?.onshapeID;
    if (stored?.documentID && stored?.elementID && stored?.wvmType && stored?.wvmID) {
        return { documentID: stored.documentID, wvmType: stored.wvmType, wvmID: stored.wvmID, elementID: stored.elementID };
    }
    const match = typeof id === "string" ? COMPOUND_ID.exec(id) : null;
    return match ? { documentID: match[1], wvmType: match[2], wvmID: match[3], elementID: match[4] } : null;
}

const onshapeURLOf = (record: BomRecord, key: OnshapeKey) =>
    trimmed(record.onshapeURL) || `https://cad.onshape.com/documents/${key.documentID}/${key.wvmType}/${key.wvmID}/e/${key.elementID}`;

/**
 * A BOM of the same Onshape assembly (document + element) saved from a
 * different workspace or version than `key`, if any (the oldest one).
 */
export async function findPublishedElsewhere(key: OnshapeKey): Promise<{ record: BomRecord; key: OnshapeKey } | null> {
    const prefix = new RegExp(`^${key.documentID}_[wvm]_[0-9a-f]{24}_${key.elementID}_`);
    const candidates = await Bom.find(
        { $or: [{ "onshapeID.documentID": key.documentID, "onshapeID.elementID": key.elementID }, { id: prefix }] },
        { id: 1, name: 1, catalogNumber: 1, onshapeID: 1, onshapeURL: 1, createdAt: 1 },
    ).sort({ createdAt: 1, id: 1 }).lean<BomRecord[]>();
    for (const record of candidates) {
        const other = onshapeKeyOf(record);
        if (other && other.documentID === key.documentID && other.elementID === key.elementID
            && (other.wvmType !== key.wvmType || other.wvmID !== key.wvmID)) {
            return { record, key: other };
        }
    }
    return null;
}

/** The read-only answer of GET /bom/publishedElsewhere. */
export async function publishedElsewhere(key: OnshapeKey) {
    const found = await findPublishedElsewhere(key);
    if (!found) return { elsewhere: false as const };
    const { record, key: other } = found;
    return {
        elsewhere: true as const,
        bom: { id: record.id, name: record.name, catalogNumber: record.catalogNumber, onshapeURL: onshapeURLOf(record, other), onshapeID: other },
    };
}

/** Two sub-assemblies of `parent` without a catalog number and with the same name, if any. */
function nameClashIn(parent: BomRecord, subs: BomRecord[], self?: string): BomClash | null {
    const byName = new Map<string, BomRecord>();
    for (const sub of subs) {
        if (trimmed(sub.catalogNumber)) continue;
        const name = trimmed(sub.name);
        if (!name) continue;
        const other = byName.get(name);
        if (other && other.id !== sub.id) {
            const theOther = other.id === self ? sub : other;
            return {
                code: "ASSEMBLY_NAME_TAKEN",
                message: `Assemblies ${label(other)} and ${label(sub)} in ${label(parent)} both have no catalog number and the same name "${name}". `
                    + "Give them catalog numbers in Onshape, then publish again. Nothing was saved.",
                fields: ["name", "catalogNumber"],
                conflictsWith: { id: theOther.id, name: theOther.name },
            };
        }
        byName.set(name, sub);
    }
    return null;
}

/**
 * Why saving BOM `id` with this body would clash, or null. Fields the body
 * leaves out keep their saved values. Saving the same record again is fine.
 */
export async function bomSaveClash(id: string, body: BomRecord): Promise<BomClash | null> {
    const saved = await Bom.findOne({ id }, { name: 1, catalogNumber: 1, subAssemblies: 1, onshapeID: 1 }).lean<BomRecord>();
    const catalogNumber = trimmed("catalogNumber" in body ? body.catalogNumber : saved?.catalogNumber);
    const name = trimmed("name" in body ? body.name : saved?.name);
    const key = onshapeKeyOf({ onshapeID: body.onshapeID ?? saved?.onshapeID }, id);

    // 0. The same Onshape assembly was published from another workspace or version.
    if (key) {
        const found = await findPublishedElsewhere(key);
        if (found) {
            const { record, key: other } = found;
            const what = trimmed(record.catalogNumber) ? `${trimmed(record.catalogNumber)} (${record.name || record.id})` : String(record.name || record.id);
            return {
                code: "ASSEMBLY_PUBLISHED_ELSEWHERE",
                message: `${what} was already published from another workspace or version of this Onshape document. `
                    + "Its BOM is kept for one workspace only: publish it from the workspace it was first published from. Nothing was saved.",
                fields: [],
                conflictsWith: { id: record.id, name: record.name },
                publishedFrom: { ...other, onshapeURL: onshapeURLOf(record, other) },
            };
        }
    }

    // 1. The catalog number is used by another assembly. (A record of the
    // same Onshape assembly and workspace, e.g. after its BOM table ID
    // changed, is the same assembly.)
    if (catalogNumber) {
        const others = await Bom.find({ catalogNumber, id: { $ne: id } }, { id: 1, name: 1, onshapeID: 1 }).lean<BomRecord[]>();
        const other = others.find((record) => {
            const otherKey = onshapeKeyOf(record);
            return !(key && otherKey && otherKey.documentID === key.documentID && otherKey.elementID === key.elementID
                && otherKey.wvmType === key.wvmType && otherKey.wvmID === key.wvmID);
        });
        if (other) {
            return {
                code: "CATALOG_NUMBER_TAKEN",
                message: `Catalog number ${catalogNumber} is already used by another assembly, "${other.name || other.id}". `
                    + "Give this assembly its own catalog number in Onshape, then publish again. Nothing was saved.",
                fields: ["catalogNumber"],
                conflictsWith: { id: other.id, name: other.name },
            };
        }
    }

    // 2. No catalog number, and a sibling in a parent that lists it has the same name.
    if (!catalogNumber && name) {
        const parents = await Bom.find({ "subAssemblies.bomID": id }, { id: 1, name: 1, subAssemblies: 1 }).lean<BomRecord[]>();
        const siblingIDs = [...new Set(parents.flatMap((p) => (p.subAssemblies ?? []).map((s: BomRecord) => s.bomID)))]
            .filter((sibling) => sibling && sibling !== id);
        if (siblingIDs.length) {
            const siblings = await Bom.find({ id: { $in: siblingIDs } }, { id: 1, name: 1, catalogNumber: 1 }).lean<BomRecord[]>();
            for (const parent of parents) {
                const listed = new Set((parent.subAssemblies ?? []).map((s: BomRecord) => s.bomID));
                const clash = nameClashIn(parent, [
                    { id, name, catalogNumber },
                    ...siblings.filter((s) => listed.has(s.id)),
                ], id);
                if (clash) return clash;
            }
        }
    }

    // 3. This BOM's own sub-assemblies (as the body lists them) clash by name.
    const subIDs = [...new Set(((("subAssemblies" in body ? body.subAssemblies : saved?.subAssemblies) ?? []) as BomRecord[])
        .map((s) => s?.bomID).filter((sub): sub is string => typeof sub === "string" && sub !== ""))];
    if (subIDs.length > 1) {
        const subs = await Bom.find({ id: { $in: subIDs } }, { id: 1, name: 1, catalogNumber: 1 }).lean<BomRecord[]>();
        const clash = nameClashIn({ id, name }, subs);
        if (clash) return clash;
    }
    return null;
}

export interface BomClashReport {
    /** Catalog numbers used by more than one BOM. */
    catalogNumbers: { catalogNumber: string; boms: { id: string; name?: string }[] }[];
    /** Parents with sub-assemblies that have no catalog number and the same name. */
    names: { parent: { id: string; name?: string }; name: string; boms: { id: string; name?: string }[] }[];
    /** Onshape assemblies (document + element) saved from more than one workspace or version. */
    workspaces: {
        documentID: string;
        elementID: string;
        boms: { id: string; name?: string; catalogNumber?: string; wvmType: string; wvmID: string }[];
    }[];
}

/** Every existing clash (read-only), from all the BOMs. */
export function bomClashes(boms: BomRecord[]): BomClashReport {
    const brief = (bom: BomRecord) => ({ id: bom.id, name: bom.name });
    const byCatalog = new Map<string, BomRecord[]>();
    for (const bom of boms) {
        const catalogNumber = trimmed(bom.catalogNumber);
        if (catalogNumber) byCatalog.set(catalogNumber, [...(byCatalog.get(catalogNumber) ?? []), bom]);
    }
    const catalogNumbers = [...byCatalog]
        .filter(([, group]) => group.length > 1)
        .map(([catalogNumber, group]) => ({ catalogNumber, boms: group.map(brief) }));

    const byID = new Map(boms.map((bom) => [bom.id, bom]));
    const names: BomClashReport["names"] = [];
    for (const parent of boms) {
        const byName = new Map<string, BomRecord[]>();
        const seen = new Set<string>();
        for (const ref of parent.subAssemblies ?? []) {
            const sub = byID.get(ref?.bomID);
            if (!sub || seen.has(sub.id) || trimmed(sub.catalogNumber) || !trimmed(sub.name)) continue;
            seen.add(sub.id);
            const name = trimmed(sub.name);
            byName.set(name, [...(byName.get(name) ?? []), sub]);
        }
        for (const [name, group] of byName) {
            if (group.length > 1) names.push({ parent: brief(parent), name, boms: group.map(brief) });
        }
    }
    const byAssembly = new Map<string, { key: OnshapeKey; bom: BomRecord }[]>();
    for (const bom of boms) {
        const key = onshapeKeyOf(bom);
        if (!key) continue;
        const assembly = `${key.documentID}/${key.elementID}`;
        byAssembly.set(assembly, [...(byAssembly.get(assembly) ?? []), { key, bom }]);
    }
    const workspaces = [...byAssembly.values()]
        .filter((group) => new Set(group.map(({ key }) => `${key.wvmType}/${key.wvmID}`)).size > 1)
        .map((group) => ({
            documentID: group[0].key.documentID,
            elementID: group[0].key.elementID,
            boms: group.map(({ key, bom }) => ({ id: bom.id, name: bom.name, catalogNumber: bom.catalogNumber, wvmType: key.wvmType, wvmID: key.wvmID })),
        }));

    return { catalogNumbers, names, workspaces };
}
