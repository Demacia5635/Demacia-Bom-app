/**
 * The website's #/files page: an overview of the team's Drive files, and
 * deleting the unused ones (the same system as /orphans).
 */
import type { NextFunction, Request, Response } from "express";
import Bom from "../models/Bom";
import Part from "../models/Part";
import { google as googleConfig } from "../config";
import { drive } from "../services/driveClient";
import { FILE_FIELDS } from "../services/driveFolderPlan";
import { driveFilesOf } from "./orphanParts";
import { updatedByOf } from "./upsert";

type Rec = Record<string, any>;

const FOLDER_MIME = "application/vnd.google-apps.folder";
/** How long an overview is reused (listing the Drive costs a request per 1000 files). */
const CACHE_MS = 10 * 60 * 1000;
const LARGEST = 50;
const MAX_DELETE = 200;

const typeFolders = () => [
    { type: "Images", folderId: googleConfig.imageFolderId },
    { type: "STL", folderId: googleConfig.stlFolderId },
    { type: "Parasolid", folderId: googleConfig.parasolidFolderId },
].filter((t) => !!t.folderId);

/** Every Drive file ID a part or BOM points at -> the first record that does. */
async function fileReferences() {
    const fields = { id: 1, name: 1, ...Object.fromEntries(FILE_FIELDS.map((f) => [f, 1])) };
    const [parts, boms] = await Promise.all([
        Part.find({}, { ...fields, wantStl: 1, wantParasolid: 1 }).lean<Rec[]>(),
        Bom.find({}, fields).lean<Rec[]>(),
    ]);
    const usedBy = new Map<string, { kind: "part" | "bom"; id: string; name?: string }>();
    for (const [kind, records] of [["part", parts], ["bom", boms]] as const) {
        for (const record of records) {
            for (const fileId of driveFilesOf(record)) if (!usedBy.has(fileId)) usedBy.set(fileId, { kind, id: record.id, name: record.name });
        }
    }
    return { parts, boms, usedBy };
}

let cached: { at: number; overview: Rec } | null = null;

async function buildOverview() {
    const [listing, { parts, boms, usedBy }] = await Promise.all([drive.listAllFiles(), fileReferences()]);
    const folders = new Map(listing.filter((f) => f.mimeType === FOLDER_MIME).map((f) => [f.id, f]));
    const types = typeFolders();
    const typeOf = new Map(types.map((t) => [t.folderId, t.type]));

    /** The type folder a file is under and its folder path there, or null. */
    const placeOf = (parents: string[]): { type: string; folderId: string; path: string } | null => {
        for (const start of parents) {
            const names: string[] = [];
            let current: string | undefined = start;
            for (let depth = 0; current && depth < 30; depth++) {
                const type = typeOf.get(current);
                if (type) return { type, folderId: current, path: names.reverse().join("/") };
                const folder = folders.get(current);
                if (!folder) break;
                names.push(folder.name);
                current = folder.parents[0];
            }
        }
        return null;
    };

    const byType = new Map(types.map((t) => [t.type, { ...t, files: 0, bytes: 0, folders: new Map<string, { files: number; bytes: number }>() }]));
    const inTeam: { fileId: string; name: string; bytes: number; type: string; path: string; modifiedTime?: string }[] = [];
    for (const file of listing) {
        if (file.mimeType === FOLDER_MIME) continue;
        const place = placeOf(file.parents);
        if (!place) continue;
        const entry = byType.get(place.type)!;
        entry.files++;
        entry.bytes += file.size;
        const folder = entry.folders.get(place.path) ?? { files: 0, bytes: 0 };
        folder.files++;
        folder.bytes += file.size;
        entry.folders.set(place.path, folder);
        inTeam.push({ fileId: file.id, name: file.name, bytes: file.size, type: place.type, path: place.path, modifiedTime: file.modifiedTime });
    }
    const listed = new Set(listing.map((f) => f.id));

    // Records whose files are missing: a link to a file that's gone (or
    // trashed), or an STL / Parasolid wanted but never linked.
    const missing: Rec[] = [];
    for (const [kind, records] of [["part", parts], ["bom", boms]] as const) {
        for (const record of records) {
            for (const field of FILE_FIELDS) {
                const fileId = driveFilesOf({ [field]: record[field] })[0];
                if (fileId && !listed.has(fileId)) missing.push({ kind, id: record.id, name: record.name, field, reason: "file not found or in trash" });
            }
            if (kind === "part") {
                if (record.wantStl && !record.stlLink) missing.push({ kind, id: record.id, name: record.name, field: "wantStl", reason: "no link" });
                if (record.wantParasolid && !record.parasolidLink) missing.push({ kind, id: record.id, name: record.name, field: "wantParasolid", reason: "no link" });
            }
        }
    }

    return {
        generatedAt: new Date().toISOString(),
        totals: { files: inTeam.length, bytes: inTeam.reduce((sum, f) => sum + f.bytes, 0) },
        types: [...byType.values()].map(({ type, folderId, files, bytes, folders: paths }) => ({
            type, folderId, files, bytes,
            folders: [...paths].map(([path, v]) => ({ path, ...v })).sort((a, b) => b.bytes - a.bytes),
        })),
        largest: [...inTeam].sort((a, b) => b.bytes - a.bytes).slice(0, LARGEST)
            .map((f) => ({ ...f, ...(usedBy.has(f.fileId) ? { usedBy: usedBy.get(f.fileId) } : {}) })),
        unused: inTeam.filter((f) => !usedBy.has(f.fileId)).sort((a, b) => b.bytes - a.bytes),
        missing,
    };
}

/** GET /api/admin/files[?refresh=1] (#/files): kept for 10 minutes; refresh=1 lists the Drive again. */
export async function getFilesOverview(req: Request, res: Response, next: NextFunction) {
    try {
        const refresh = req.query.refresh === "1" || req.query.refresh === "true";
        if (refresh || !cached || Date.now() - cached.at > CACHE_MS) cached = { at: Date.now(), overview: await buildOverview() };
        return res.status(200).json(cached.overview);
    } catch (err) {
        return next(err);
    }
}

/**
 * POST /api/admin/files/delete { ids } (1-200): moves unused files to Drive's
 * trash. Each is re-checked right before: refused if a part or BOM points at
 * it, or if it isn't in the team folders. One log line per file.
 */
export async function deleteUnusedFiles(req: Request, res: Response, next: NextFunction) {
    try {
        const ids = req.body?.ids;
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_DELETE || !ids.every((id) => typeof id === "string" && /^[A-Za-z0-9_-]{10,100}$/.test(id)))
            return res.status(400).json({ message: `ids must be a list of 1-${MAX_DELETE} Drive file IDs`, fields: ["ids"] });
        const { usedBy } = await fileReferences();
        const who = updatedByOf(req).updatedBy || "unknown";
        const deleted: { fileId: string; name?: string }[] = [];
        const refused: { fileId: string; reason: string }[] = [];
        for (const fileId of [...new Set(ids as string[])]) {
            const user = usedBy.get(fileId);
            if (user) {
                refused.push({ fileId, reason: `is used by ${user.kind === "part" ? "part" : "assembly"} ${user.name || user.id}` });
                continue;
            }
            try {
                const location = await drive.fileLocation(fileId);
                if (!location || location.trashed) {
                    refused.push({ fileId, reason: "not found (or already in Drive's trash)" });
                    continue;
                }
                if (!(await drive.isInTeamFolders(fileId))) {
                    refused.push({ fileId, reason: "isn't in the team folders" });
                    continue;
                }
                await drive.deleteFile(fileId); // to Drive's trash
                deleted.push({ fileId, name: location.name });
                console.log(`[file delete ${res.locals.requestId}] by ${who}: moved unused Drive file ${fileId} "${location.name}" to Drive's trash`);
            } catch (err: any) {
                refused.push({ fileId, reason: `error: ${err?.message ?? err}` });
            }
        }
        // The overview is out of date now.
        if (deleted.length) cached = null;
        return res.status(200).json({ deleted, refused });
    } catch (err) {
        return next(err);
    }
}
