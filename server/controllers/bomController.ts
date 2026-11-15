import { NextFunction, Request, Response } from "express";
import Bom from '../models/Bom';
import { cleanUpdateBody, upsertWithRetry } from './upsert';

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

export async function getAllBoms(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const boms = await Bom.find().sort({ id: 1 });
        return res.status(200).json(boms);
    } catch (err) {
        return next(err);
    }
}

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

export async function upsertBomByID(
    req: Request<{ id: string }, unknown, BomBody>,
    res: Response,
    next: NextFunction
) {
    try {
        const id = req.params.id;
        const existing = await Bom.findOne({ id: id });
        // Plain fields only, under $set: the body used to be passed as the
        // update itself, so {"$unset": ...} or {"$rename": ...} ran as operators.
        const bom = await upsertWithRetry(() => Bom.findOneAndUpdate(
            { id: id },
            { $set: { ...cleanUpdateBody(req.body), id: id } },
            {
                returnDocument: 'after',
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            },
        ));
        
        return res.status(existing ? 200 : 201).json(bom);
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

export async function getBomByOnsahpeKey(
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

/** Most IDs accepted by one batch lookup. */
const MAX_BATCH_IDS = 500;

/**
 * POST /ids  body: { ids: [...] }  -> the records that exist (any order).
 * Read-only: unlike GET /id/:id it never creates a missing record. Lets a
 * page load all of a BOM's items in one request instead of one per item.
 */
export async function getBomsByIds(req: Request, res: Response, next: NextFunction) {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id: unknown) => typeof id === "string") : [];
        if (ids.length > MAX_BATCH_IDS) return res.status(400).json({ message: `At most ${MAX_BATCH_IDS} ids per request` });
        if (ids.length === 0) return res.status(200).json([]);
        const records = await Bom.find({ id: { $in: ids } });
        return res.status(200).json(records);
    } catch (err) {
        return next(err);
    }
}
