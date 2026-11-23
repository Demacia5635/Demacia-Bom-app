import { NextFunction, Request, Response } from "express";
import Bom from '../models/Bom';
import Part from '../models/Part';
import { loadBoms, partIDsOf } from './bomTree';
import { scheduleOrganizeAfterSave } from '../services/driveOrganizer';
import { cleanUpdateBody, updatedByOf, upsertByID } from './upsert';
import { makeGetByIds } from './getByIds';
import { makeListAll } from './listAll';

interface OnshapeID {
    documentID: string;
    wvmType: string;
    wvmID: string;
    elementID: string;
    bomID: string;
}

interface SubPartBody {
    partID: string;
    quantity?: number;
}

interface SubAssemblyBody {
    bomID: string;
    quantity?: number;
}

interface BomBody {
    name?: string;
    catalogNumber?: string;
    projectCatalogNumber?: string;
    description?: string;
    engineer?: string;

    parts?: SubPartBody[];
    subAssemblies?: SubAssemblyBody[];

    onshapeURL?: string;

    comments?: string;
    onshapeID?: OnshapeID;
}

function formID(onshapeID: OnshapeID): string {
    return `${onshapeID.documentID}_${onshapeID.wvmType}_${onshapeID.wvmID}_${onshapeID.elementID}_${onshapeID.bomID}`;
}

/** GET /all: every BOM, or one page of them (see makeListAll). */
export const getAllBoms = makeListAll(Bom, { id: 1 }, ["name", "catalogNumber", "projectCatalogNumber", "description", "id"]);

export async function getBomByID(
    req: Request<{ id: string}>,
    res: Response,
    next: NextFunction
) {
    try {
        const id = req.params.id;
        const bom = await Bom.findOne({ id: id });
        if (!bom)
            return res.status(404).json({ message: `Bom ${id} not found` });
        return res.status(200).json(bom);
    } catch (err) {
        return next(err);
    }
}

/**
 * GET /usedIn/:id: the BOMs that use this BOM as a sub-assembly ("Used in"),
 * by name: [{ id, name, catalogNumber, quantity, driveFileId, avatarID,
 * imageUrl, thumbnailURL }]. quantity is how many of it each one lists.
 * An empty list when nothing uses it (or it isn't saved).
 */
export async function getBomUsedIn(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const id = req.params.id;
        const parents = await Bom.find(
            { "subAssemblies.bomID": id },
            { id: 1, name: 1, catalogNumber: 1, subAssemblies: 1, driveFileId: 1, avatarID: 1, imageUrl: 1, thumbnailURL: 1 },
        ).lean<Record<string, any>[]>();
        const usedIn = parents
            .map(({ subAssemblies, _id, ...parent }): Record<string, any> => ({
                ...parent,
                quantity: (subAssemblies ?? [])
                    .filter((sub: { bomID?: string }) => sub?.bomID === id)
                    .reduce((sum: number, sub: { quantity?: number }) => sum + (sub.quantity ?? 1), 0),
            }))
            .sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id)));
        return res.status(200).json(usedIn);
    } catch (err) {
        return next(err);
    }
}

/** Deepest sub-assembly level GET /tree/:id follows (the root is level 0). */
const MAX_TREE_DEPTH = 10;
/** Most BOMs one tree request returns. */
const MAX_TREE_BOMS = 2000;

/**
 * GET /tree/:id: a BOM with all its sub-assemblies and parts, in one request
 * instead of one per level:
 * { rootID, boms: [...], parts: [...], missing: { boms, parts }, truncated }.
 * boms includes the root; missing lists IDs the BOMs refer to that aren't
 * saved. One query per level, then one for all the parts. A BOM reached
 * twice (shared, or a cycle) is fetched once. truncated is true when the
 * tree went deeper than 10 levels or past 2000 BOMs; what's below is left out.
 */
export async function getBomTree(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const rootID = req.params.id;
        const loaded = await loadBoms([rootID], MAX_TREE_DEPTH, MAX_TREE_BOMS);
        if (!loaded.boms.has(rootID))
            return res.status(404).json({ message: `Bom ${rootID} not found` });
        const boms = [...loaded.boms.values()];
        const missingBoms = loaded.missing;
        const truncated = loaded.truncated;
        const partIDs = partIDsOf(boms);

        const parts = partIDs.size ? await Part.find({ id: { $in: [...partIDs] } }).lean<Record<string, any>[]>() : [];
        const foundParts = new Set(parts.map((part) => part.id));
        const missingParts = [...partIDs].filter((id) => !foundParts.has(id));

        return res.status(200).json({
            rootID,
            boms,
            parts,
            missing: { boms: missingBoms, parts: missingParts },
            truncated,
        });
    } catch (err) {
        return next(err);
    }
}

export async function upsertBomByID(
    req: Request<{ id: string }, unknown, BomBody>,
    res: Response,
    next: NextFunction
) {
    try {
        const id = req.params.id;
        // Plain fields only, under $set: the body used to be passed as the
        // update itself, so {"$unset": ...} or {"$rename": ...} ran as operators.
        const { doc: bom, created } = await upsertByID(Bom, id, { $set: { ...cleanUpdateBody(req.body), ...updatedByOf(req), id: id } });
        // Sorts its assembly's Drive files into folders a minute after the
        // publish's last save (in the background; never fails this save).
        scheduleOrganizeAfterSave(id);

        return res.status(created ? 201 : 200).json(bom);
    } catch (err) {
        return next(err);
    }
}

export async function deleteBomByID(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const id = req.params.id;
        const deleted = await Bom.findOneAndDelete({ id: id });
        
        if (!deleted)
            return res.status(404).json({ message: `Bom ${id} not found`});
        return res.status(204).json();
    } catch (err) {
        return next(err);
    }
}

export async function getBomByOnshapeKey(
    req: Request<OnshapeID>,
    res: Response,
    next: NextFunction
) {
    try {
        const id = formID(req.params);
        const delegateReq = req as unknown as Request<{ id: string }>;
        delegateReq.params = { id: id };
        return getBomByID(delegateReq, res, next);
    } catch (err) {
        return next(err);
    }
}

export async function upsertBomByOnshapeKey(
    req: Request<OnshapeID, unknown, BomBody>,
    res: Response,
    next: NextFunction
) {
    try {
        const id = formID(req.params);
        const delegateReq = req as unknown as Request<{ id: string }, unknown, BomBody>;
        delegateReq.params = { id: id };
        delegateReq.body = {
            ...req.body,
            onshapeID: req.params
        }
        return upsertBomByID(delegateReq, res, next);
    } catch (err) {
        return next(err);
    }
}

export async function deleteBomByOnshapeKey(
    req: Request<OnshapeID>,
    res: Response,
    next: NextFunction
) {
    try {
        const id = formID(req.params);
        const delegateReq = req as unknown as Request<{ id: string }>;
        delegateReq.params = { id: id };
        return deleteBomByID(delegateReq, res, next);
    } catch (err) {
        return next(err);
    }
}

/** POST /ids: the Bom records with these ids. */
export const getBomsByIds = makeGetByIds(Bom);
