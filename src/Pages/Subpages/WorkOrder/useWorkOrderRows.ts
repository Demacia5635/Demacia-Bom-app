import { useEffect, useRef, useState } from "react";
import { fetchFromApi, type ApiError } from "../../../util/ApiService";
import { loadBomTree, workOrderLines } from "../../../util/bomTree";
import type { PartModel, WorkOrderModel } from "../../../util/Models";
import { partDisplayName } from "../../../util/partDisplayName";
import { recordImageSrc } from "../../../util/recordImage";
import { fetchPartsByIds } from "../../../util/records";
import type WorkOrderTableRow from "./WorkOrderTableRow";
import { isPurchasedRow } from "./useWorkOrderFilters";
import { boughtStatus } from "./workOrderOptions";
import { revisionLabel } from "../../../util/partRevision";

const ISRAEL_TIME = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
});

/**
 * Israel time as yy/MM/dd-HH:mm:ss (e.g. 26/11/14-19:05:00), which also sorts
 * correctly as text. "" for no or invalid dates.
 */
export function formatIsraelTime(value: Date | string | undefined | null): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const p = Object.fromEntries(ISRAEL_TIME.formatToParts(date).map((part) => [part.type, part.value]));
    return `${p.year}/${p.month}/${p.day}-${p.hour}:${p.minute}:${p.second}`;
}


/** A stored status (a number in older work orders, or a name) as its name. */
function parseStatusToString(code: number | string | undefined): string {
  if (code === 1 || code === '1' || code === 'In Planning') return 'In Planning';
  if (code === 2 || code === '2' || code === 'Manufacturing approved') return 'Manufacturing approved';
  if (code === 3 || code === '3' || code === 'In manufacturing') return 'In manufacturing';
  if (code === 4 || code === '4' || code === 'Finished Manufacturing') return 'Finished Manufacturing';
  if (code === 'Untracked') return 'Untracked';
  return typeof code === 'string' && code.trim() !== '' ? code : 'In Planning';
}

/**
 * Loads a work order and builds its table rows from its assembly's live BOM
 * (a part's own saved progress laid over it). `onLoaded` gets the work
 * order when it arrives. Another work order is another page (App.tsx keys
 * the page by id), so this loads once.
 */
export function useWorkOrderRows(workOrderID: string | undefined, onLoaded: (workOrder: WorkOrderModel) => void) {
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  const [rows, setRows] = useState<WorkOrderTableRow[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  // True from the start: the parts load right after the work order, so the
  // table never flashes empty first.
  const [loading, setLoading] = useState<boolean>(true);
  const [workOrderData, setWorkOrderData] = useState<WorkOrderModel | null>(null);
  /** The part each row is for (row ids include the work order id). */
  const rowPartMapRef = useRef<Map<string, string>>(new Map());
  // The assembly's name and catalog number, from the BOM loaded for the rows (work orders don't store them).
  const [bomName, setBomName] = useState<{ workOrderID: string; name: string; catalogNumber: string } | null>(null);

  useEffect(() => {
    if (!workOrderID) return;
    // Another work order is a new page (App.tsx keys it by id); a late reply
    // after leaving is ignored.
    let cancelled = false;

    async function getWOData() {
        try {
            const data = await fetchFromApi<WorkOrderModel>(`/db/workOrder/id/${workOrderID}`);
            if (cancelled) return;
            setWorkOrderData(data);
            // Its CNC groups as loaded (later changes come back from the server).
            onLoadedRef.current(data);
            // No assembly: no parts to load (the page says so).
            if (!data?.bomID) setLoading(false);

            // The assembly image comes from the BOM record (WorkOrderDataUI).
        } catch (err: any) {
            if (!cancelled) {
                setError(err);
                setLoading(false);
            }
        }
    }
    getWOData();
    return () => { cancelled = true; };
  }, [workOrderID]);

  useEffect(() => {
    // Only the work order in the URL (not the previous one, still loaded for a moment).
    if (!workOrderID || !workOrderData || !workOrderData.bomID || workOrderData.id !== workOrderID) return;
    let cancelled = false;

    async function getPartsData(): Promise<WorkOrderTableRow[]> {
        // The live BOM (util/bomTree.ts, as when the work order was made): its
        // parts with their totals, a bought sub-assembly as one purchased row.
        const tree = await loadBomTree(workOrderData!.bomID!, (root) => {
            if (!cancelled && root) setBomName({ workOrderID: workOrderID!, name: root.name || "", catalogNumber: root.catalogNumber || "" });
        });
        const { totals: aggregatedQuantities, bought: boughtAssemblies } = workOrderLines(tree);
        const collectedRows: WorkOrderTableRow[] = [];
        // Not cleared: row ids include the work order id, and a save still
        // waiting for a row of the previous work order looks its part up here.

        // The tree has every part listed in a BOM; only a bought sub-assembly's
        // own part record (saved under its BOM id) may still be needed.
        const missing = [...aggregatedQuantities.keys()].filter((id) => !tree.parts.has(id));
        const extraRecords = missing.length > 0 ? await fetchPartsByIds(missing) : new Map<string, PartModel>();

        for (const [partID, totalQty] of aggregatedQuantities.entries()) {
            let part: PartModel | null = tree.parts.get(partID) ?? extraRecords.get(partID) ?? null;
            const boughtBom = boughtAssemblies.get(partID);

            if (!part && boughtBom) {
                // A bought sub-assembly without its own part record: shown by its BOM record.
                part = {
                    id: partID,
                    name: boughtBom.name,
                    catalogNumber: boughtBom.catalogNumber || "",
                    description: boughtBom.description,
                    avatarID: boughtBom.avatarID,
                    onshapeURL: boughtBom.onshapeURL || "",
                    vendor: boughtBom.vendor,
                    markedStandard: boughtBom.markedStandard,
                };
            } else if (!part) {
                part = {
                    id: partID,
                    name: partID,
                    catalogNumber: "",
                    material: "",
                    comments: "",
                    onshapeURL: "",
                    stlLink: "",
                    parasolidLink: "",
                } as any;
            }

            const existingWoPart = workOrderData?.parts?.find((p) => p.partID === partID);

            let avatarUrl = recordImageSrc(part);

            const rowId = `${workOrderID}-part-${partID}`;
            rowPartMapRef.current.set(rowId, partID);

            const partRow: WorkOrderTableRow = {
                id: rowId,
                parentId: null,
                isExpanded: false,
                avatar: avatarUrl,
                // Empty until the part is first changed in this work order.
                lastUpadte: formatIsraelTime(existingWoPart?.updatedAt),
                productionMakingOwner: existingWoPart?.productionMakingOwner || "",
                catalogNumber: part?.catalogNumber || "",
                revision: revisionLabel(part),
                name: partDisplayName(part, partID),
                size: part?.size || "",
                partID,
                quantityTotal: totalQty,
                // A bought sub-assembly not saved in this work order yet (one made
                // before they were listed whole) starts as bought, like on creation.
                statusCode: boughtBom && !existingWoPart ? "Untracked" : parseStatusToString(existingWoPart?.statusCode),
                approxArrivalDate: existingWoPart?.approxArrivalDate || "",
                manufacturingMethod: existingWoPart?.manufacturingMethod || (part as any)?.manufacturingMethod || (boughtBom ? "Purchased" : "Manual"),
                // Not stored per work order (the server keeps no material there): the part's.
                material: part?.material || "",
                Priority: existingWoPart?.Priority || "Medium",
                comments: existingWoPart?.comments || part?.comments || "",
                links: existingWoPart?.links || (part as any)?.links || "",
                onshapeURL: part?.onshapeURL || "",
                exportSTL: part?.stlLink || "",
                exportParasolid: part?.parasolidLink || "",
                vendor: part?.vendor || "",
                isStandardContent: !!part?.isStandardContent,
                markedStandard: !!part?.markedStandard,
            };
            // A bought item shows its own status list (stored values mapped, not rewritten).
            if (isPurchasedRow(partRow)) partRow.statusCode = boughtStatus(partRow.statusCode, partRow.Priority);
            collectedRows.push(partRow);
        }
        return collectedRows;
    }

    // (loading is already true: this runs once, when the work order arrives)
    getPartsData()
        .then((data) => { if (!cancelled) setRows(data); })
        .catch((err: ApiError) => { if (!cancelled) setError(err); })
        .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workOrderID, workOrderData]);

  return { workOrderData, rows, setRows, loading, error, bomName, rowPartMapRef };
}
