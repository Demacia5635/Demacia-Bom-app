import type { ColumnConfig } from "../../../components/Table";
import { downloadFile } from "../../../util/ApiService";
import type WorkOrderTableRow from "./WorkOrderTableRow";

/** Vendor parts and Onshape Standard Content: their name isn't edited here. */
const isBoughtPart = (row: WorkOrderTableRow) => row.vendor !== "" || !!row.isStandardContent;

export const MANUFACTURING_METHODS = ['Manual', 'Milled', 'Lathed', 'CNC', 'Printed', 'Externally produced', 'Purchased'];
export const PRIORITIES = ['High', 'Medium', 'Low', 'Untracked', 'Finished'];

// Avatar and name come first: the table freezes the first two columns.
const WorkOrderColumns: ColumnConfig[] = [
    { key: "avatar", label: "Avatar", type: "image", isDisabled: isBoughtPart },
    // Name, catalogue number and quantity come from the BOM: not changed here.
    { key: "name", label: "Name", type: "string", isDisabled: () => true },
    { key: "lastUpadte", label: "Last Updated", type: "string", isDisabled: () => true },
    { key: "productionMakingOwner", label: "Production Making Owner", type: "string" },
    { key: "catalogNumber", label: "Catalogue Number", type: "string", isDisabled: () => true }, // Read-only
    { key: "quantityTotal", label: "Qty Per Assembly", type: "number", isDisabled: () => true },
    {
        key: "statusCode",
        label: "Status",
        type: "select",
        options: ['CATNUM Written', 'In Planning', 'Manufacturing approved', 'In manufacturing', 'Finished Manufacturing', 'Untracked'],
        // Standard Content is purchased: not tracked through manufacturing.
        isDisabled: (row: WorkOrderTableRow) => !!row.isStandardContent,
    },
    { key: "approxArrivalDate", label: "Approx. Arrival Date", type: "string" },
    {
        key: "manufacturingMethod",
        label: "Manufacturing Method",
        type: "select",
        options: MANUFACTURING_METHODS,
        // Standard Content is always "Purchased".
        isDisabled: (row: WorkOrderTableRow) => !!row.isStandardContent,
    },
    { key: "material", label: "Material", type: "string", isDisabled: () => true }, // Read-only
    { 
        key: "Priority", 
        label: "Priority", 
        type: "select", 
        options: PRIORITIES,
    },
    { key: "comments", label: "Comments", type: "string", isDisabled: () => true }, // Read-only
    { key: "links", label: "Links", type: "string" },
    
    // Actions / Links at the end
    {
        key: "onshapeURL",
        label: "CAD Link",
        type: "button",
        buttonText: "Open CAD",
        isDisabled: (row: WorkOrderTableRow) => !row.onshapeURL && !(row as any).onshapeID?.documentID,
        onButtonClick: (row: WorkOrderTableRow) => {
            let url = row.onshapeURL;
            if (!url && (row as any).onshapeID) {
                const { documentID, wvmType = "w", wvmID, elementID, partID } = (row as any).onshapeID;
                url = `https://cad.onshape.com/documents/${documentID}/${wvmType}/${wvmID}/e/${elementID}?partId=${partID}`;
            }
            if (url) window.open(url, "_blank");
        },
    },
    {
        key: "exportSTL",
        label: "Export STL",
        type: "button",
        buttonText: "Download",
        // Files are saved in Google Drive on publish; no Onshape fallback.
        isDisabled: (row: WorkOrderTableRow) => !row.exportSTL,
        onButtonClick: (row: WorkOrderTableRow) => {
            if (!row.exportSTL) return;
            downloadFile(`${import.meta.env.VITE_CLIENT_URL}/api/drive/file/id/${row.exportSTL}`, `${row.name || "part"}.stl`);
        },
    },
    {
        key: "exportParasolid",
        label: "Export Parasolid",
        type: "button",
        buttonText: "Download",
        isDisabled: (row: WorkOrderTableRow) => !row.exportParasolid,
        onButtonClick: (row: WorkOrderTableRow) => {
            if (!row.exportParasolid) return;
            downloadFile(`${import.meta.env.VITE_CLIENT_URL}/api/drive/file/id/${row.exportParasolid}`, `${row.name || "part"}.x_t`);
        },
    },
];

export default WorkOrderColumns;