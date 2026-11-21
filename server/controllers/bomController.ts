import { NextFunction, Request, Response } from "express";
import Bom from '../models/Bom';
import { cleanUpdateBody, upsertByID } from './upsert';
import { makeGetByIds } from './getByIds';

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
        // Plain fields only, under $set: the body used to be passed as the
        // update itself, so {"$unset": ...} or {"$rename": ...} ran as operators.
        const { doc: bom, created } = await upsertByID(Bom, id, { $set: { ...cleanUpdateBody(req.body), id: id } });

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
