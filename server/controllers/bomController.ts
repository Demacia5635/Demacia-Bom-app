import { NextFunction, Request, Response } from "express";
import Bom from '../models/Bom';
import Part from '../models/Part';
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
        const boms: any[] = [];
        const seen = new Set<string>([rootID]);
        const missingBoms: string[] = [];
        const partIDs = new Set<string>();
        let level = [rootID];
        let truncated = false;

        for (let depth = 0; level.length > 0; depth++) {
            if (depth > MAX_TREE_DEPTH || boms.length + level.length > MAX_TREE_BOMS) {
                truncated = true;
                break;
            }
            const found = await Bom.find({ id: { $in: level } }).lean<Record<string, any>[]>();
            if (depth === 0 && found.length === 0)
                return res.status(404).json({ message: `Bom ${rootID} not found` });
            const foundIDs = new Set(found.map((bom) => bom.id));
            missingBoms.push(...level.filter((id) => !foundIDs.has(id)));
            boms.push(...found);

            const nextLevel: string[] = [];
            for (const bom of found) {
                for (const part of bom.parts ?? []) if (part?.partID) partIDs.add(part.partID);
                for (const sub of bom.subAssemblies ?? []) {
                    if (sub?.bomID && !seen.has(sub.bomID)) {
                        seen.add(sub.bomID);
                        nextLevel.push(sub.bomID);
                    }
                }
            }
            level = nextLevel;
        }

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
