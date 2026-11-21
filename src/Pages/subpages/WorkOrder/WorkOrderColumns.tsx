import type { ColumnConfig } from "../../../components/Table";
import { cadLinkColumn, fileDownloadColumns } from "../partColumns";
import type WorkOrderTableRow from "./WorkOrderTableRow";
import { isPurchasedPart } from "../../../util/Models";
import { MANUFACTURING_METHODS, PRIORITIES } from "./workOrderOptions";

/**
 * Onshape Standard Content and parts marked standard in the extension: status
 * and method are fixed. Narrower than isPurchasedPart on purpose: a vendor
 * part's method and priority can still be set here.
 */
const isStandardRow = (row: WorkOrderTableRow) => !!row.isStandardContent || !!row.markedStandard;


/**
 * Colour of each status / method / priority value (classes styled in
 * DarkMode.css and LightMode.css). Values not listed stay uncoloured.
 */
const VALUE_COLOURS: Record<string, string> = {
    'In Planning': 'status-bg-orange',
    'In manufacturing': 'status-bg-orange',
    'Medium': 'status-bg-orange',
    'Manual': 'status-bg-orange',

    'Manufacturing approved': 'status-bg-blue',
    'Untracked': 'status-bg-blue',
    'Milled': 'status-bg-blue',
    'Lathed': 'status-bg-blue',
    'CNC': 'status-bg-blue',
    'Printed': 'status-bg-blue',
    'Externally produced': 'status-bg-blue',
    'Purchased': 'status-bg-blue',

    'Finished Manufacturing': 'status-bg-green',
    'Finished': 'status-bg-green',
    'Low': 'status-bg-green',

    'CATNUM Written': 'status-bg-red',
    'High': 'status-bg-red',
};
const valueColour = (value: unknown) => VALUE_COLOURS[String(value ?? '')];

// Avatar and name come first: the table freezes the first two columns.
const WorkOrderColumns: ColumnConfig[] = [
    { key: "avatar", label: "Avatar", type: "image", isDisabled: isPurchasedPart },
    // Name, catalogue number and quantity come from the BOM: not changed here.
    { key: "name", label: "Name", type: "string", isDisabled: () => true },
    // Shown by the "Show size" checkbox (WorkOrderDetailsPage); saved by Publish BOM.
    { key: "size", label: "Size", type: "string", isDisabled: () => true },
    { key: "lastUpadte", label: "Last Updated", type: "string", isDisabled: () => true },
    { key: "productionMakingOwner", label: "Production Making Owner", type: "string" },
    { key: "catalogNumber", label: "Catalogue Number", type: "string", isDisabled: () => true }, // Read-only
    { key: "quantityTotal", label: "Qty Per Assembly", type: "number", isDisabled: () => true },
    {
        key: "statusCode",
        label: "Status",
        type: "select",
        valueClass: valueColour,
        options: ['CATNUM Written', 'In Planning', 'Manufacturing approved', 'In manufacturing', 'Finished Manufacturing', 'Untracked'],
        // Standard items are purchased: not tracked through manufacturing.
        isDisabled: isStandardRow,
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