import {NextFunction, Request, Response} from 'express';
import { productionType, statuses } from '../db/enum';

/** The entry whose `id` equals the route's :id (a whole number), if any. */
function findById<T extends { id: number }>(list: T[], rawId: string): T | undefined {
    if (!/^\d+$/.test(rawId)) return undefined;
    const id = Number(rawId);
    return list.find((entry) => entry.id === id);
}

export function getAllProductionTypes(req: Request, res: Response, next: NextFunction) {
    return res.status(200).json(productionType);
}

export function getProductionTypeByID(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    const type = findById(productionType, req.params.id);

    if (!type)
        return res.status(404).json({ message: `Production type ${req.params.id} not found` });
    return res.status(200).json(type);
}

export function getAllStatuses(req: Request, res: Response, next: NextFunction) {
    return res.status(200).json(statuses);
}

export function getStatusByID(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    const status = findById(statuses, req.params.id);

    if (!status)
        return res.status(404).json({ message: `Status ${req.params.id} not found` });
    return res.status(200).json(status);
}
