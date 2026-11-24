import { Request, Response } from 'express';
import { productionType } from '../db/enum';

/** The entry whose `id` equals the route's :id (a whole number), if any. */
function findById<T extends { id: number }>(list: T[], rawId: string): T | undefined {
    if (!/^\d+$/.test(rawId)) return undefined;
    const id = Number(rawId);
    return list.find((entry) => entry.id === id);
}

export function getAllProductionTypes(req: Request, res: Response) {
    return res.status(200).json(productionType);
}

export function getProductionTypeByID(req: Request<{ id: string }>, res: Response) {
    const type = findById(productionType, req.params.id);

    if (!type)
        return res.status(404).json({ message: `Production type ${req.params.id} not found` });
    return res.status(200).json(type);
}
