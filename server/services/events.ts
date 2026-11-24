/**
 * Recording what happened (models/Event.ts), for #/activity and #/revisions.
 * Recording never delays or fails the action: it's written in the background
 * and a failure is only logged.
 *
 * Kinds:
 * - part.create, part.revision (details: { from, to, fields }), part.delete
 * - bom.publish (one per top-level assembly after a publish: details { bomSaves })
 * - workOrder.create, workOrder.save, workOrder.part (details: { partID, fields }),
 *   workOrder.cncGroup (details: { groupID, partIDs })
 * - parts.cleanup, drive.organize, drive.fileDelete, revisions.init, admin.locked
 * Part saves that don't change the revision aren't recorded (a publish saves
 * every part; the feed would hold only the last few publishes).
 */
import Event from "../models/Event";

export interface EventInput {
    kind: string;
    who?: string;
    record?: { kind: "part" | "bom" | "workOrder"; id: string; name?: string };
    message: string;
    details?: Record<string, unknown>;
}

/** Records an event in the background. */
export function recordEvent(event: EventInput): void {
    Event.create({ ...event, who: event.who || undefined }).catch((err: any) =>
        console.error(`[events] couldn't record ${event.kind}:`, err?.message ?? err));
}

/** "Dana" or "Someone", for messages. */
export const whoOf = (who?: string) => (who && who.trim()) || "Someone";
