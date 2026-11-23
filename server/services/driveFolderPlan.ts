/**
 * Where every Drive file of the parts and assemblies belongs, inside each of
 * the three type folders (Images, STL, Parasolid). The user's rules:
 * - Each assembly has a folder named by its catalog number (its name if it
 *   has none), nested like the BOM tree: 2714-0000/2714-1000/2714-1100.
 * - An assembly's own image goes in its own folder; a part's files go in the
 *   folder of the first assembly that lists it.
 * - "First" is a fixed order: the top-level assemblies (listed in no other
 *   BOM) oldest first (createdAt, then id), each walked depth-first, an
 *   assembly's own parts before its sub-assemblies, both in BOM order. A
 *   sub-assembly used in several places gets its folder where it's first
 *   reached. So a file only moves when a BOM, or a catalog number, changes.
 * - Bought items go in "Standard parts" directly inside the type folder: a
 *   bought part directly, a bought sub-assembly as its own folder there, with
 *   everything inside it nested the same way.
 * This only plans (reading records); services/driveOrganizer.ts moves files.
 */

export const STANDARD_PARTS_FOLDER = "Standard parts";

type BomRecord = Record<string, any>;
type PartRecord = Record<string, any>;

/** The record fields that hold Drive file IDs. */
export const FILE_FIELDS = ["avatarID", "driveFileId", "stlLink", "parasolidLink"] as const;
type FileField = (typeof FILE_FIELDS)[number];

/** A Drive file ID (not a URL or a data: image, which avatarID may also hold). */
const DRIVE_ID = /^[A-Za-z0-9_-]{10,100}$/;

export interface Placement {
    fileId: string;
    /** Folder names below the type folder ([] = the type folder itself). */
    path: string[];
    record: { kind: "part" | "bom"; id: string; name?: string };
    field: FileField;
    /** The top-level assembly whose walk placed it. */
    topID: string;
}

export interface FolderPlan {
    /** fileId -> where it belongs (the first record that reached it wins). */
    placements: Map<string, Placement>;
    /** Files of records no assembly reaches: left where they are. */
    unplaced: { fileId: string; record: { kind: "part" | "bom"; id: string; name?: string } }[];
    /** Top-level assembly IDs, in walk order. */
    topIDs: string[];
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** The folder name of an assembly: its catalog number, else its name, else its ID. */
export function folderNameOf(bom: BomRecord): string {
    return text(bom.catalogNumber) || text(bom.name) || String(bom.id);
}

const isBoughtBom = (bom: BomRecord) => !!bom.markedStandard || text(bom.vendor) !== "";
const isBoughtPart = (part: PartRecord) => !!part.isStandardContent || !!part.markedStandard || text(part.vendor) !== "";

/** A record's Drive file IDs, with the field each came from (each ID once). */
function filesOf(record: Record<string, any>): { fileId: string; field: FileField }[] {
    const files: { fileId: string; field: FileField }[] = [];
    for (const field of FILE_FIELDS) {
        const value = text(record[field]);
        if (DRIVE_ID.test(value) && !files.some((f) => f.fileId === value)) files.push({ fileId: value, field });
    }
    return files;
}

const sortKey = (bom: BomRecord) => {
    const time = bom.createdAt ? new Date(bom.createdAt).getTime() : Number.NEGATIVE_INFINITY;
    return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

/** The top-level assemblies (listed in no other BOM), oldest first, then by id. */
export function topLevelBoms(boms: BomRecord[]): BomRecord[] {
    const listed = new Set<string>();
    for (const bom of boms) for (const sub of bom.subAssemblies ?? []) if (sub?.bomID) listed.add(sub.bomID);
    return boms
        .filter((bom) => !listed.has(bom.id))
        .sort((a, b) => sortKey(a) - sortKey(b) || String(a.id).localeCompare(String(b.id)));
}

/**
 * Plans every file's folder. `parts` holds every part record the BOMs list,
 * plus any part record saved under a BOM's ID (a marked sub-assembly is also
 * saved as a part); its files go with that BOM.
 */
export function planFolders(boms: BomRecord[], parts: PartRecord[]): FolderPlan {
    const bomsByID = new Map(boms.map((bom) => [bom.id, bom]));
    const partsByID = new Map(parts.map((part) => [part.id, part]));
    const placements = new Map<string, Placement>();
    const placedRecords = new Set<string>();
    const reachedBoms = new Set<string>();

    const place = (record: Record<string, any>, kind: "part" | "bom", path: string[], topID: string) => {
        const key = `${kind}:${record.id}`;
        if (placedRecords.has(key)) return;
        placedRecords.add(key);
        for (const { fileId, field } of filesOf(record)) {
            if (placements.has(fileId)) continue;
            placements.set(fileId, { fileId, path, record: { kind, id: record.id, name: record.name }, field, topID });
        }
    };

    const walk = (bom: BomRecord, parentPath: string[], insideBought: boolean, topID: string) => {
        const bought = !insideBought && isBoughtBom(bom);
        const path = bought ? [STANDARD_PARTS_FOLDER, folderNameOf(bom)] : [...parentPath, folderNameOf(bom)];
        const inBought = insideBought || bought;

        place(bom, "bom", path, topID);
        const ownPart = partsByID.get(bom.id);
        if (ownPart) place(ownPart, "part", path, topID);

        for (const ref of bom.parts ?? []) {
            const part = partsByID.get(ref?.partID);
            if (!part) continue;
            // Inside a bought assembly everything keeps its nesting; elsewhere
            // a bought part goes straight into Standard parts.
            const partPath = !inBought && isBoughtPart(part) ? [STANDARD_PARTS_FOLDER] : path;
            place(part, "part", partPath, topID);
        }
        for (const ref of bom.subAssemblies ?? []) {
            const sub = bomsByID.get(ref?.bomID);
            if (!sub || reachedBoms.has(sub.id)) continue;
            reachedBoms.add(sub.id);
            walk(sub, path, inBought, topID);
        }
    };

    const tops = topLevelBoms(boms);
    for (const top of tops) {
        if (reachedBoms.has(top.id)) continue;
        reachedBoms.add(top.id);
        walk(top, [], false, top.id);
    }

    // Records no walk reached (parts in no assembly, BOMs only in a cycle).
    const unplaced: FolderPlan["unplaced"] = [];
    const collect = (record: Record<string, any>, kind: "part" | "bom") => {
        if (placedRecords.has(`${kind}:${record.id}`)) return;
        for (const { fileId } of filesOf(record)) {
            if (!placements.has(fileId)) unplaced.push({ fileId, record: { kind, id: record.id, name: record.name } });
        }
    };
    boms.forEach((bom) => collect(bom, "bom"));
    parts.forEach((part) => collect(part, "part"));

    return { placements, unplaced, topIDs: tops.map((top) => top.id) };
}
