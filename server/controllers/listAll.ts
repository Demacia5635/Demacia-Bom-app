import type { NextFunction, Request, Response } from "express";
import type { Model, SortOrder } from "mongoose";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_QUERY_LENGTH = 100;

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * GET /all for a collection.
 * - No query parameters: every record, in `sort` order (as always).
 * - With any of limit, after, q: one page, as { items, next }, ordered by id.
 *   limit: 1-500 (default 100). after: the `next` of the previous page.
 *   q: text that one of `searchFields` contains (any case).
 *   next is null on the last page.
 */
export function makeListAll(model: Model<any>, sort: Record<string, SortOrder>, searchFields: string[]) {
    return async function listAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, after, q } = req.query;
            if (limit === undefined && after === undefined && q === undefined) {
                return res.status(200).json(await model.find().sort(sort));
            }

            const size = limit === undefined ? DEFAULT_LIMIT : Number(limit);
            if (!Number.isInteger(size) || size < 1 || size > MAX_LIMIT)
                return res.status(400).json({ message: `limit must be a whole number from 1 to ${MAX_LIMIT}`, fields: ["limit"] });
            if (after !== undefined && typeof after !== "string")
                return res.status(400).json({ message: "after must be the next value of the previous page", fields: ["after"] });
            if (q !== undefined && (typeof q !== "string" || q.length > MAX_QUERY_LENGTH))
                return res.status(400).json({ message: `q must be text of up to ${MAX_QUERY_LENGTH} characters`, fields: ["q"] });

            const filter: Record<string, unknown> = {};
            if (after) filter.id = { $gt: after };
            if (q) {
                const pattern = new RegExp(escapeRegex(q), "i");
                filter.$or = searchFields.map((field) => ({ [field]: pattern }));
            }
            // One extra record tells whether there's another page.
            const found = await model.find(filter).sort({ id: 1 }).limit(size + 1);
            const items = found.slice(0, size);
            const hasMore = found.length > size;
            return res.status(200).json({ items, next: hasMore ? items[items.length - 1].id : null });
        } catch (err) {
            return next(err);
        }
    };
}
