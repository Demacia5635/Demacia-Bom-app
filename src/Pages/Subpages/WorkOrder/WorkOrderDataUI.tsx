import { useState, useEffect } from "react";
import type { WorkOrderModel, BomModel } from "../../../util/Models";
import { fetchFromApi } from "../../../util/ApiService";
import { recordImageSrc } from "../../../util/recordImage";
import RecordHeaderCard from "../../../components/RecordHeaderCard";
import { CatalogNumber } from "../../../components/CopyButton";
import HeaderTotals from "../../../components/HeaderTotals";

interface WorkOrderDataUIProps {
    workOrder: WorkOrderModel;
    /** The rows' totals (once loaded): lines, pieces, and finished of the made parts. */
    totals?: { parts: number; quantity: number; made: number; finished: number };
}

/** The work-order page's header: the work order, with its assembly's image and catalog number. */
const WorkOrderDataUI: React.FC<WorkOrderDataUIProps> = ({ workOrder, totals }) => {
    // Kept with the id it was loaded for: another work order's BOM is never shown.
    const [loadedBom, setLoadedBom] = useState<{ bomID: string; bom: BomModel } | null>(null);
    const bomData = workOrder?.bomID && loadedBom?.bomID === workOrder.bomID ? loadedBom.bom : null;

    // Fetch the parent BOM data using workOrder.bomID to get its exact image source.
    // Another work order: a late reply for the previous one is ignored.
    useEffect(() => {
        const bomID = workOrder?.bomID;
        if (!bomID) return;
        let cancelled = false;
        fetchFromApi<BomModel>(`/db/bom/id/${encodeURIComponent(bomID)}`)
            .then((bom) => { if (!cancelled) setLoadedBom({ bomID, bom }); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [workOrder?.bomID]);

    return (
        <RecordHeaderCard
            className="mb-6"
            // The parent BOM's image; the work order's own until the BOM has loaded.
            imageSrc={recordImageSrc(bomData) || recordImageSrc(workOrder)}
            imageAlt={workOrder.name || "Work Order Thumbnail"}
            title={workOrder.name || "Unnamed Assembly"}
            description={workOrder.description}
            facts={[
                // Not stored on the work order: the assembly's.
                { label: "Catalog No", value: <CatalogNumber value={bomData?.catalogNumber} onHover={false} /> },
                { label: "Owner", value: workOrder.workOrderOwner || "N/A" },
                { label: "Parts", value: workOrder.parts?.length || 0 },
            ]}
            middle={totals && (
                <HeaderTotals
                    items={[
                        { value: totals.parts, label: totals.parts === 1 ? "part" : "parts" },
                        { value: totals.quantity, label: "pieces" },
                        {
                            value: `${totals.finished}/${totals.made}${totals.made > 0 ? ` (${Math.round((totals.finished / totals.made) * 100)}%)` : ""}`,
                            label: "finished",
                            title: "Finished parts of the parts the team makes (purchased and untracked parts left out)",
                        },
                    ]}
                />
            )}
            comments={workOrder.comments}
        />
    );
};

export default WorkOrderDataUI;
