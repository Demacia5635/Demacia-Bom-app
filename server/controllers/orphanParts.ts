/**
 * Parts no assembly uses ("orphans"): the user's rule is that they shouldn't
 * exist. GET /db/part/orphans lists them for the website's /orphans page, and
 * POST /db/part/orphans/delete (admin) deletes them.
 */
import type { NextFunction, Request, Response } from "express";
import Bom from "../models/Bom";
import Part from "../models/Part";
import { FILE_FIELDS } from "../services/driveFolderPlan";
import { drive } from "../services/driveClient";
import { updatedByOf } from "./upsert";
import { recordEvent, whoOf } from "../services/events";

type Rec = Record<string, any>;

/** A Drive file ID (not a URL or a data: image, which avatarID may also hold). */
const DRIVE_ID = /^[A-Za-z0-9_-]{10,100}$/;

/** A record's Drive file IDs (each once). */
export function driveFilesOf(record: Rec): string[] {
    const ids = new Set<string>();
    for (const field of FILE_FIELDS) {
        const value = typeof record[field] === "string" ? record[field].trim() : "";
        if (DRIVE_ID.test(value)) ids.add(value);
    }
    return [...ids];
}

/**
 * The part IDs in use, from all the BOMs: every ID a BOM lists in its parts,
 * plus the ID of every BOM marked standard (a marked sub-assembly is also
 * saved as a part record with its own ID, which it needs while it's marked).
 * Once the mark is removed, that part record is a leftover: not in use.
 * The one rule for orphans everywhere (this list, the delete routes, /db/health).
 */
export function usedPartIDs(boms: Rec[]): Set<string> {
    const used = new Set<string>();
    for (const bom of boms) {
        if (bom.markedStandard) used.add(bom.id);
        for (const ref of bom.parts ?? []) if (ref?.partID) used.add(ref.partID);
    }
    return used;
}

/** All BOMs (the fields the orphan rule and the file counts need) and the part IDs in use. */
export async function loadUsage() {
    const boms = await Bom.find({}, { id: 1, name: 1, parts: 1, markedStandard: 1, ...Object.fromEntries(FILE_FIELDS.map((f) => [f, 1])) }).lean<Rec[]>();
    return { boms, used: usedPartIDs(boms) };
}

/**
 * Why a part can't be deleted, from the database as it is now, or null.
 * `allowUnmarkedLeftover`: a part record with the ID of an assembly that's no
 * longer marked standard may go even if a parent still lists it (the
 * extension deletes it right after saving the unmarked assembly, before the
 * parent is saved).
 */
export async function partInUse(id: string, allowUnmarkedLeftover = false): Promise<string | null> {
    const own = await Bom.findOne({ id }, { id: 1, name: 1, markedStandard: 1 }).lean<Rec>();
    if (own?.markedStandard) return `is the part record of the standard assembly ${own.name || own.id}`;
    if (own && allowUnmarkedLeftover) return null;
    const parent = await Bom.findOne({ "parts.partID": id }, { id: 1, name: 1 }).lean<Rec>();
    return parent ? `is used by assembly ${parent.name || parent.id} (${parent.id})` : null;
}

/** fileId -> how many records (parts and BOMs) point at it. */
export function fileReferenceCounts(records: Rec[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const record of records) for (const id of driveFilesOf(record)) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
}

/** A part's Drive files that no other part or BOM points at (the ones a delete trashes). */
export const ownFilesOf = (part: Rec, counts: Map<string, number>) => driveFilesOf(part).filter((id) => (counts.get(id) ?? 0) <= 1);

const createdTime = (part: Rec) => (part.createdAt ? new Date(part.createdAt).getTime() : 0) || 0;

/**
 * GET /db/part/orphans: every part no BOM uses, newest first, as full part
 * records plus filesToTrash (how many of its Drive files no other record
 * uses, i.e. what deleting it would move to Drive's trash).
 */
export async function getOrphanParts(req: Request, res: Response, next: NextFunction) {
    try {
        const [{ boms, used }, parts] = await Promise.all([loadUsage(), Part.find({}).lean<Rec[]>()]);
        const counts = fileReferenceCounts([...boms, ...parts]);
        const orphans = parts
            .filter((part) => !used.has(part.id))
            .sort((a, b) => createdTime(b) - createdTime(a) || String(a.id).localeCompare(String(b.id)))
            .map(({ _id, __v, ...part }) => ({ ...part, filesToTrash: ownFilesOf(part, counts).length }));
        return res.status(200).json(orphans);
    } catch (err) {
        return next(err);
    }
}

/** Most parts one delete request takes. */
const MAX_DELETE = 200;

export interface PartDeleteResult {
    deleted: { id: string; name?: string; catalogNumber?: string; filesTrashed: string[] }[];
    refused: { id: string; reason: string }[];
}

/**
 * Deletes parts no BOM uses, re-checking each one right before deleting it,
 * so a used part is never deleted. Its Drive files that no other part or BOM
 * points at go to Drive's trash (30 days); shared ones stay. Each delete is
 * one log line with who, the trashed files and the whole record (to restore
 * it by hand if needed). Shared by the /orphans page's route and the cleanup
 * after a publish.
 */
export async function deleteUnusedParts(ids: string[], who: string, logTag: string): Promise<PartDeleteResult> {
    const result: PartDeleteResult = { deleted: [], refused: [] };
    const fileFields = Object.fromEntries(FILE_FIELDS.map((f) => [f, 1]));
    const [boms, parts] = await Promise.all([
        Bom.find({}, { id: 1, ...fileFields }).lean<Rec[]>(),
        Part.find({}, { id: 1, ...fileFields }).lean<Rec[]>(),
    ]);
    const counts = fileReferenceCounts([...boms, ...parts]);

    for (const id of [...new Set(ids)]) {
        const reason = await partInUse(id);
        if (reason) {
            result.refused.push({ id, reason });
            continue;
        }
        const part = await Part.findOneAndDelete({ id }).lean<Rec>();
        if (!part) {
            result.refused.push({ id, reason: "not found" });
            continue;
        }
        const filesTrashed: string[] = [];
        for (const fileId of driveFilesOf(part)) {
            const left = (counts.get(fileId) ?? 1) - 1;
            counts.set(fileId, left);
            if (left > 0) continue; // another record still points at it
            try {
                if (await drive.isInTeamFolders(fileId)) {
                    await drive.deleteFile(fileId); // to Drive's trash
                    filesTrashed.push(fileId);
                }
            } catch (err: any) {
                console.error(`${logTag} couldn't trash Drive file ${fileId} of part ${id}:`, err?.message ?? err);
            }
        }
        const { _id, __v, ...record } = part;
        console.log(`${logTag} by ${who || "unknown"}: deleted part ${id} "${part.name ?? ""}"; files to Drive's trash: [${filesTrashed.join(", ")}]; record: ${JSON.stringify(record)}`);
        recordEvent({
            kind: "part.delete", who, record: { kind: "part", id, name: part.name },
            message: `${whoOf(who)} deleted part ${part.name || id} (not in any assembly)${filesTrashed.length ? `; ${filesTrashed.length} file(s) to Drive's trash` : ""}`,
            details: { filesTrashed, source: logTag },
        });
        result.deleted.push({ id, name: part.name, catalogNumber: part.catalogNumber, filesTrashed });
    }
    return result;
}

/**
 * POST /db/part/orphans/delete { ids } (admin): deletes those parts if no BOM
 * uses them. 200 { deleted, refused } (a partial success is still 200).
 */
export async function deleteOrphanParts(req: Request, res: Response, next: NextFunction) {
    try {
        const ids = req.body?.ids;
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_DELETE || !ids.every((id) => typeof id === "string" && id !== "" && id.length <= 300))
            return res.status(400).json({ message: `ids must be a list of 1-${MAX_DELETE} part IDs`, fields: ["ids"] });
        const result = await deleteUnusedParts(ids, updatedByOf(req).updatedBy ?? "", `[part delete ${res.locals.requestId}]`);
        return res.status(200).json(result);
    } catch (err) {
        return next(err);
    }
}
