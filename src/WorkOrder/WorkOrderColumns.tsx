import type { ColumnConfig } from "../components/Table";
import { downloadFile } from "../util/ApiService";
import type WorkOrderTableRow from "./WorkOrderTableRow";

const WorkOrderColumns: ColumnConfig[] = [
    { key: "avatar", label: "Avatar", type: "image", isDisabled: (row) => row.vendor !== "" },
    { key: "lastUpadte", label: "Last Updated", type: "string", isDisabled: () => true },
    { key: "productionMakingOwner", label: "Production Making Owner", type: "string" },
    { key: "catalogNumber", label: "Catalogue Number", type: "string", isDisabled: (row) => row.vendor !== "" },
    { key: "name", label: "Name", type: "string", isDisabled: (row) => row.vendor !== "" },
    { key: "quantityTotal", label: "Qty Per Assembly", type: "number", isDisabled: () => true },
    { 
        key: "statusCode", 
        label: "Status", 
        type: "select", 
        options: ['In creation', 'Finished creation', 'Given to assembly kit'] 
    },
    { key: "approxArrivalDate", label: "Approx. Arrival Date", type: "string" },
    { 
        key: "manufacturingMethod", 
        label: "Manufacturing Method", 
        type: "select", 
        options: ['Manual', 'Milled', 'Lathed', 'CNC'] 
    },
    { 
        key: "importance", 
        label: "Importance", 
        type: "select", 
        options: ['High', 'Medium', 'Low'] 
    },
    { key: "comments", label: "Comments", type: "string" },
    
    // Actions / Links at the end
    {
        key: "onshapeURL",
        label: "Links",
        type: "button",
        buttonText: "Open CAD",
        isDisabled: () => true,
        onButtonClick: (row) => {
            if (row.onshapeURL) window.open(row.onshapeURL, "_blank");
        },
    },
    {
        key: "exportSTL",
        label: "Export STL",
        type: "button",
        buttonText: "Download",
        isDisabled: () => true,
        onButtonClick: (row: WorkOrderTableRow) => {
            if (row.exportSTL) {
                const downloadUrl = `${import.meta.env.VITE_CLIENT_URL}/api/drive/file/${row.exportSTL}`;
                downloadFile(downloadUrl, `${row.name || "part"}.stl`);
            }
        },
    },
    {
        key: "exportParasolid",
        label: "Export Parasolid",
        type: "button",
        buttonText: "Download",
        isDisabled: () => true,
        onButtonClick: (row: WorkOrderTableRow) => {
            if (row.exportParasolid) {
                const downloadUrl = `${import.meta.env.VITE_CLIENT_URL}/api/drive/file/${row.exportParasolid}`;
                downloadFile(downloadUrl, `${row.name || "part"}.parasolid`);
            }
        },
    },
];

export default WorkOrderColumns;