/**
 * Parts no assembly uses ("orphans"): the user's rule is that they shouldn't
 * exist. GET /db/part/orphans lists them for the website's /orphans page.
 */
import type { NextFunction, Request, Response } from "express";
import Bom from "../models/Bom";
import Part from "../models/Part";
import { FILE_FIELDS } from "../services/driveFolderPlan";

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
 * What decides whether a part is an orphan, and which of its files no other
 * record uses: the IDs BOMs use (listed parts and sub-assemblies, and the
 * BOMs' own IDs, since a marked sub-assembly is also saved as a part), and how
 * many records point at each Drive file.
 */
export async function loadUsage() {
    const boms = await Bom.find({}, { id: 1, parts: 1, subAssemblies: 1, ...Object.fromEntries(FILE_FIELDS.map((f) => [f, 1])) }).lean<Rec[]>();
    const used = new Set<string>();
    for (const bom of boms) {
        used.add(bom.id);
        for (const ref of bom.parts ?? []) if (ref?.partID) used.add(ref.partID);
        for (const ref of bom.subAssemblies ?? []) if (ref?.bomID) used.add(ref.bomID);
    }
    return { boms, used };
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
