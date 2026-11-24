/**
 * Sorts the parts' and assemblies' Drive files into assembly folders inside
 * each type folder (Images, STL, Parasolid), as services/driveFolderPlan.ts
 * plans. Files are MOVED (their IDs and links stay, so the database doesn't
 * change); nothing is deleted or copied, folders are found or created by name
 * (never twice), and emptied folders are left alone. Runs in the background,
 * one run at a time, and is idempotent: a second run finds everything in place.
 *
 * Started by POST /api/drive/organize (dry run or real), and after a publish
 * (scheduleOrganizeAfterSave, for the published assembly's tree only).
 */
import { randomUUID } from "crypto";
import Bom from "../models/Bom";
import Part from "../models/Part";
import { google as googleConfig } from "../config";
import { bomClashes, type BomClashReport } from "../controllers/bomNameClash";
import { drive } from "./driveClient";
import { FILE_FIELDS, planFolders, type Placement } from "./driveFolderPlan";
import { isTeamFolder } from "./driveService";
import { deleteUnusedParts } from "../controllers/orphanParts";

/** Most moves / skips one job keeps for its report (the counts are always complete). */
const MAX_LISTED = 5000;
/** Jobs remembered for GET /organize (in memory: a restart forgets them). */
const MAX_JOBS = 10;

export interface OrganizeMove {
    fileId: string;
    record: Placement["record"];
    field: Placement["field"];
    from: string;
    to: string;
}

export interface OrganizeJob {
    id: string;
    dryRun: boolean;
    trigger: "manual" | "publish";
    /** For a publish: the top-level assemblies whose files were checked. */
    topIDs?: string[];
    status: "running" | "done" | "failed";
    startedAt: string;
    finishedAt?: string;
    progress: { done: number; total: number };
    summary: {
        /** Moved (a dry run: would move). */
        moved: number;
        alreadyInPlace: number;
        /** Files of parts/assemblies no assembly reaches (left where they are; full runs only). */
        notInAnyAssembly: number;
        /** Skipped files by reason. */
        skipped: Record<string, number>;
        /** Folders created (a dry run: would create). */
        foldersCreated: number;
    };
    moves: OrganizeMove[];
    skipped: { fileId: string; record: Placement["record"]; reason: string }[];
    /** Existing catalog-number / name clashes (they share a folder name until fixed). */
    clashes?: BomClashReport;
    error?: string;
    /**
     * Publish runs: the parts the publish dropped from its BOMs that no BOM
     * uses any more, deleted first (controllers/orphanParts.ts). A cleanup
     * failure is reported here and doesn't stop the sort.
     */
    cleanup?: {
        candidates: number;
        deleted: { id: string; name?: string; filesTrashed: string[] }[];
        kept: { id: string; reason: string }[];
        error?: string;
    };
}

const jobs: OrganizeJob[] = [];
let running: Promise<void> | null = null;

export const listJobs = () => jobs.map(brief);
export const getJob = (id: string) => jobs.find((job) => job.id === id);
// The job without its long lists (for GET /organize).
const brief = ({ moves: _moves, skipped: _skipped, clashes: _clashes, ...rest }: OrganizeJob) => rest;

const TYPE_NAMES: Record<string, string> = {
    [googleConfig.imageFolderId]: "Images",
    [googleConfig.stlFolderId]: "STL",
    [googleConfig.parasolidFolderId]: "Parasolid",
};

/** The records the plan needs: every BOM and every part (with only the fields it reads). */
async function loadRecords() {
    const fileFields = Object.fromEntries(FILE_FIELDS.map((field) => [field, 1]));
    const boms = await Bom.find({}, {
        id: 1, name: 1, catalogNumber: 1, createdAt: 1, parts: 1, subAssemblies: 1, markedStandard: 1, vendor: 1, onshapeID: 1, ...fileFields,
    }).lean<Record<string, any>[]>();
    // All parts, so files of parts in no assembly are counted (and left alone).
    const parts = await Part.find({}, {
        id: 1, name: 1, isStandardContent: 1, markedStandard: 1, vendor: 1, ...fileFields,
    }).lean<Record<string, any>[]>();
    return { boms, parts };
}

/** Runs one job: plans, then checks (and moves) each planned file. */
/** Deletes the parts a publish dropped from this job's trees, if no BOM uses them now. Never throws. */
async function cleanUp(job: OrganizeJob): Promise<void> {
    const candidates = new Map<string, string>(); // partID -> who saved the BOM that dropped it
    for (const top of job.topIDs ?? []) {
        for (const [partID, who] of droppedByTop.get(top) ?? []) candidates.set(partID, who);
        droppedByTop.delete(top);
    }
    if (candidates.size === 0) return;
    job.cleanup = { candidates: candidates.size, deleted: [], kept: [] };
    try {
        const who = [...new Set(candidates.values())].filter(Boolean).join(", ");
        const result = await deleteUnusedParts([...candidates.keys()], who, `[part cleanup after publish ${job.id.slice(0, 8)}]`);
        job.cleanup.deleted = result.deleted.map(({ id, name, filesTrashed }) => ({ id, name, filesTrashed }));
        job.cleanup.kept = result.refused;
    } catch (err: any) {
        job.cleanup.error = err?.message ?? String(err);
        console.error(`[part cleanup after publish ${job.id.slice(0, 8)}] failed:`, err);
    }
}

async function run(job: OrganizeJob): Promise<void> {
    if (job.trigger === "publish") await cleanUp(job);
    // Without the type folders configured there's nothing to sort.
    if (!googleConfig.imageFolderId && !googleConfig.stlFolderId && !googleConfig.parasolidFolderId) return;
    const { boms, parts } = await loadRecords();
    const plan = planFolders(boms, parts);
    if (job.trigger === "manual") {
        job.summary.notInAnyAssembly = plan.unplaced.length;
        job.clashes = bomClashes(boms);
    }
    const scope = job.topIDs ? new Set(job.topIDs) : null;
    const placements = [...plan.placements.values()]
        .filter((p) => !scope || scope.has(p.topID))
        // Grouped by folder, so each folder is looked up once in a row.
        .sort((a, b) => a.path.join("/").localeCompare(b.path.join("/")));
    job.progress.total = placements.length;

    // folderId -> its type folder (or null: not under one). Type folders map to themselves.
    const typeRootOf = new Map<string, string | null>();
    const typeRoot = async (folderId: string, depth = 0): Promise<string | null> => {
        if (isTeamFolder(folderId)) return folderId;
        if (typeRootOf.has(folderId)) return typeRootOf.get(folderId)!;
        let root: string | null = null;
        if (depth < 20) {
            const location = await drive.fileLocation(folderId);
            for (const parent of location?.parents ?? []) {
                root = await typeRoot(parent, depth + 1);
                if (root) break;
            }
        }
        typeRootOf.set(folderId, root);
        return root;
    };
    // "<type folder>|a/b/c" -> folder ID (null: doesn't exist yet, in a dry run).
    const folders = new Map<string, string | null>();
    const folderNames = new Map<string, string>(); // folder ID -> readable path, for the report
    const resolveFolder = async (root: string, path: string[]): Promise<string | null> => {
        let parent: string | null = root;
        for (let i = 0; i < path.length; i++) {
            const key = `${root}|${path.slice(0, i + 1).join("/")}`;
            if (!folders.has(key)) {
                const found: string | null = parent === null ? null : await drive.findOrCreateFolder(path[i], parent, false);
                if (found === null && parent !== null && !job.dryRun) {
                    folders.set(key, await drive.findOrCreateFolder(path[i], parent, true));
                    job.summary.foldersCreated++;
                } else {
                    if (found === null) job.summary.foldersCreated++; // would be created
                    folders.set(key, found);
                }
                const id = folders.get(key);
                if (id) folderNames.set(id, `${TYPE_NAMES[root] ?? root}/${path.slice(0, i + 1).join("/")}`);
            }
            parent = folders.get(key)!;
        }
        return parent;
    };
    const describe = (folderId: string) => folderNames.get(folderId) ?? TYPE_NAMES[folderId] ?? `folder ${folderId}`;
    const skip = (placement: Placement, reason: string) => {
        job.summary.skipped[reason] = (job.summary.skipped[reason] ?? 0) + 1;
        if (job.skipped.length < MAX_LISTED) job.skipped.push({ fileId: placement.fileId, record: placement.record, reason });
    };

    for (const placement of placements) {
        try {
            const location = await drive.fileLocation(placement.fileId);
            if (!location) skip(placement, "not found in Drive");
            else if (location.trashed) skip(placement, "in Drive's trash");
            else if (location.isFolder) skip(placement, "is a folder");
            else {
                let root: string | null = null;
                for (const parent of location.parents) {
                    root = await typeRoot(parent);
                    if (root) break;
                }
                if (!root) skip(placement, "not in a team folder");
                else {
                    const target = placement.path.length ? await resolveFolder(root, placement.path) : root;
                    if (target && location.parents.length === 1 && location.parents[0] === target) {
                        job.summary.alreadyInPlace++;
                    } else {
                        if (!job.dryRun) await drive.moveFile(placement.fileId, target!, location.parents.filter((p) => p !== target));
                        job.summary.moved++;
                        if (job.moves.length < MAX_LISTED) {
                            job.moves.push({
                                fileId: placement.fileId,
                                record: placement.record,
                                field: placement.field,
                                from: location.parents.map(describe).join(", ") || "(no folder)",
                                to: [TYPE_NAMES[root] ?? root, ...placement.path].join("/"),
                            });
                        }
                    }
                }
            }
        } catch (err: any) {
            const status = Number(err?.response?.status ?? err?.code);
            // Drive refusing us altogether (sign-in): stop instead of failing every file.
            if (status === 401 || err?.response?.data?.error === "invalid_grant") throw err;
            skip(placement, `error: ${err?.message ?? err}`);
        }
        job.progress.done++;
    }
}

function newJob(dryRun: boolean, trigger: OrganizeJob["trigger"], topIDs?: string[]): OrganizeJob {
    const job: OrganizeJob = {
        id: randomUUID(),
        dryRun,
        trigger,
        ...(topIDs ? { topIDs } : {}),
        status: "running",
        startedAt: new Date().toISOString(),
        progress: { done: 0, total: 0 },
        summary: { moved: 0, alreadyInPlace: 0, notInAnyAssembly: 0, skipped: {}, foldersCreated: 0 },
        moves: [],
        skipped: [],
    };
    jobs.unshift(job);
    jobs.splice(MAX_JOBS);
    return job;
}

/** Starts a job now (the caller made sure none is running). */
function launch(job: OrganizeJob): void {
    const label = `[drive organize ${job.id.slice(0, 8)}${job.dryRun ? " dry run" : ""}, ${job.trigger}]`;
    console.log(`${label} started${job.topIDs ? ` for ${job.topIDs.join(", ")}` : ""}`);
    running = run(job)
        .then(() => {
            job.status = "done";
        })
        .catch((err) => {
            job.status = "failed";
            job.error = err?.message ?? String(err);
            console.error(`${label} failed:`, err);
        })
        .finally(() => {
            job.finishedAt = new Date().toISOString();
            const { moved, alreadyInPlace, notInAnyAssembly, skipped, foldersCreated } = job.summary;
            const cleanup = job.cleanup
                ? `; cleanup: ${job.cleanup.deleted.length} deleted, ${job.cleanup.kept.length} kept`
                    + `${job.cleanup.kept.length ? ` (${job.cleanup.kept.map((k) => `${k.id} ${k.reason}`).join("; ")})` : ""}`
                    + `${job.cleanup.error ? `, failed: ${job.cleanup.error}` : ""}`
                : "";
            console.log(`${label} ${job.status}: ${job.dryRun ? "would move" : "moved"} ${moved}, already in place ${alreadyInPlace}, `
                + `not in any assembly ${notInAnyAssembly}, folders ${job.dryRun ? "to create" : "created"} ${foldersCreated}, `
                + `skipped ${JSON.stringify(skipped)}${cleanup}`);
            running = null;
            startPending();
        });
}

/** Starts a manual run (POST /organize). null if a run is going on. */
export function startOrganize(dryRun: boolean): OrganizeJob | null {
    if (running) return null;
    const job = newJob(dryRun, "manual");
    launch(job);
    return job;
}

// ---- After a publish ----

/** Wait after the last BOM save in a tree before sorting it (a publish saves many BOMs). */
const PUBLISH_DEBOUNCE_MS = 60_000;
const timers = new Map<string, NodeJS.Timeout>();
/** Top-level assemblies waiting for a run (their timer fired while another run was going on). */
const pendingTops = new Set<string>();
/** Top-level assembly -> parts a publish dropped from a BOM in its tree (partID -> who saved). */
const droppedByTop = new Map<string, Map<string, string>>();

function startPending(): void {
    if (running || pendingTops.size === 0) return;
    const topIDs = [...pendingTops];
    pendingTops.clear();
    launch(newJob(false, "publish", topIDs));
}

/** The top-level assemblies above a BOM (itself if nothing lists it). */
async function topsAbove(bomID: string): Promise<string[]> {
    const tops = new Set<string>();
    const seen = new Set<string>([bomID]);
    let level = [bomID];
    for (let depth = 0; level.length > 0 && depth < 50; depth++) {
        const parents = await Bom.find({ "subAssemblies.bomID": { $in: level } }, { id: 1, subAssemblies: 1 }).lean<Record<string, any>[]>();
        const withParent = new Set<string>();
        for (const parent of parents) for (const sub of parent.subAssemblies ?? []) if (level.includes(sub?.bomID)) withParent.add(sub.bomID);
        level.filter((id) => !withParent.has(id)).forEach((id) => tops.add(id));
        level = parents.map((p) => p.id).filter((id) => !seen.has(id));
        level.forEach((id) => seen.add(id));
    }
    return [...tops];
}

/**
 * After a BOM is saved: 60 s after the last BOM save in its top-level
 * assembly's tree (a publish saves bottom-up, the top assembly last), deletes
 * the parts the publish dropped (`droppedPartIDs`) that no BOM uses by then,
 * then sorts the tree's Drive files. A part moved between sub-assemblies in
 * the same publish is listed again by then, so it stays. In the background:
 * it never delays or fails the save.
 */
export function scheduleOrganizeAfterSave(bomID: string, droppedPartIDs: string[] = [], who = ""): void {
    topsAbove(bomID)
        .then((tops) => {
            for (const top of tops) {
                if (droppedPartIDs.length) {
                    const dropped = droppedByTop.get(top) ?? new Map<string, string>();
                    for (const id of droppedPartIDs) dropped.set(id, who);
                    droppedByTop.set(top, dropped);
                }
                clearTimeout(timers.get(top));
                const timer = setTimeout(() => {
                    timers.delete(top);
                    pendingTops.add(top);
                    startPending();
                }, PUBLISH_DEBOUNCE_MS);
                timer.unref(); // Doesn't keep a shutting-down server alive.
                timers.set(top, timer);
            }
        })
        .catch((err) => console.error(`[drive organize] couldn't schedule a sort after saving BOM ${bomID}:`, err));
}
