import type { NextFunction, Request, Response } from "express";
import type { Model } from "mongoose";

/** Most IDs accepted by one batch lookup. */
const MAX_BATCH_IDS = 500;

/**
 * POST /ids  body: { ids: [...] }  -> the records that exist (any order).
 * Read-only: unlike GET /id/:id it never creates a missing record. Lets a
 * page load all of a BOM's items in one request instead of one per item.
 */
export function makeGetByIds(model: Model<any>) {
    return async function getByIds(req: Request, res: Response, next: NextFunction) {
        try {
            const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id: unknown) => typeof id === "string") : [];
            if (ids.length > MAX_BATCH_IDS) return res.status(400).json({ message: `At most ${MAX_BATCH_IDS} ids per request`, fields: ["ids"] });
            if (ids.length === 0) return res.status(200).json([]);
            const records = await model.find({ id: { $in: ids } });
            return res.status(200).json(records);
        } catch (err) {
            return next(err);
        }
    };
}
