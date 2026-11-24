import type { ColumnConfig } from "../../../components/Table";
import { cadLinkColumn, fileDownloadColumns } from "../partColumns";
import type WorkOrderTableRow from "./WorkOrderTableRow";
import { isPurchasedPart } from "../../../util/Models";
import { BOUGHT_STATUSES, MADE_STATUSES, MANUFACTURING_METHODS, PRIORITIES, valueColour } from "./workOrderOptions";
import { isPurchasedRow } from "./useWorkOrderFilters";

/**
 * Onshape Standard Content and parts marked standard in the extension: the
 * method is fixed ("Purchased"); the status can be set like any part's.
 * Narrower than isPurchasedPart on purpose: a vendor part's method can still
 * be set here.
 */
const isStandardRow = (row: WorkOrderTableRow) => !!row.isStandardContent || !!row.markedStandard;



// Avatar and name come first: the table freezes the first two columns.
const WorkOrderColumns: ColumnConfig<WorkOrderTableRow>[] = [
    { key: "avatar", label: "Avatar", type: "image", isDisabled: isPurchasedPart },
    // Name, catalogue number and quantity come from the BOM: not changed here.
    { key: "name", label: "Name", type: "string", isDisabled: () => true },
    // Shown by the "Show size" checkbox (WorkOrderDetailsPage); saved by Publish BOM.
    { key: "size", label: "Size", type: "string", isDisabled: () => true },
    { key: "lastUpadte", label: "Last Updated", type: "string", isDisabled: () => true },
    { key: "productionMakingOwner", label: "Production Making Owner", type: "string" },
    { key: "catalogNumber", label: "Catalogue Number", type: "string", isDisabled: () => true }, // Read-only
    // The part's revision, kept by the server; "—" for standard parts.
    { key: "revision", label: "Revision", type: "string", isDisabled: () => true },
    { key: "quantityTotal", label: "Qty Per Assembly", type: "number", isDisabled: () => true },
    {
        key: "statusCode",
        label: "Status",
        type: "select",
        valueClass: valueColour,
        options: MADE_STATUSES,
        // A bought item (isPurchasedRow) has its own list: Untracked / To buy /
        // Finished. Its status never counts towards the made / finished progress.
        rowOptions: (row: WorkOrderTableRow) => (isPurchasedRow(row) ? BOUGHT_STATUSES : MADE_STATUSES),
    },
    { key: "approxArrivalDate", label: "Approx. Arrival Date", type: "string" },
    {
        key: "manufacturingMethod",
        label: "Manufacturing Method",
        type: "select",
        valueClass: valueColour,
        options: MANUFACTURING_METHODS,
        // Standard items are always "Purchased".
        isDisabled: isStandardRow,
    },
    { key: "material", label: "Material", type: "string", isDisabled: () => true }, // Read-only
    { 
        key: "Priority", 
        label: "Priority", 
        type: "select",
        valueClass: valueColour, 
        options: PRIORITIES,
    },
    { key: "comments", label: "Comments", type: "string", isDisabled: () => true }, // Read-only
    // Parts cut in one CNC run share one Links cell (merged, like Excel).
    { key: "links", label: "Links", type: "string", mergeKey: (row: WorkOrderTableRow) => row.cncGroupID },
    
    // Actions / Links at the end
    cadLinkColumn<WorkOrderTableRow>({ label: "CAD Link", buttonText: "Open CAD", url: (row) => row.onshapeURL || undefined }),
    ...fileDownloadColumns<WorkOrderTableRow>(),
];

export default WorkOrderColumns;