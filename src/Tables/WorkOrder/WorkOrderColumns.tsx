import type { ColumnConfig } from "../../components/Table";
import { downloadFile } from "../../util/ApiService";
import type WorkOrderTableRow from "./WorkOrderTableRow";

const WorkOrderColumns: ColumnConfig[] = [
    { key: "avatar", label: "Avatar", type: "image", isDisabled: (row) => row.vendor !== "" },
    { key: "lastUpadte", label: "Last Updated", type: "string", isDisabled: () => true },
    { key: "productionMakingOwner", label: "Production Making Owner", type: "string" },
    { key: "catalogNumber", label: "Catalogue Number", type: "string", isDisabled: () => true }, // Read-only
    { key: "name", label: "Name", type: "string", isDisabled: (row) => row.vendor !== "" },
    { key: "quantityTotal", label: "Qty Per Assembly", type: "number", isDisabled: () => true },
    { 
        key: "statusCode", 
        label: "Status", 
        type: "select", 
        options: ['CATNUM Written', 'In Planning', 'Manufacturing approved', 'In manufacturing', 'Finished Manufacturing'] 
    },
    { key: "approxArrivalDate", label: "Approx. Arrival Date", type: "string" },
    { 
        key: "manufacturingMethod", 
        label: "Manufacturing Method", 
        type: "select", 
        options: ['Manual', 'Milled', 'Lathed', 'CNC', 'Printed', 'Externally produced'] 
    },
    { key: "material", label: "Material", type: "string", isDisabled: () => true }, // Read-only
    { 
        key: "Priority", 
        label: "Priority", 
        type: "select", 
        options: ['High', 'Medium', 'Low', 'Untracked', 'Finished'] 
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
        isDisabled: (row: WorkOrderTableRow) => !row.exportSTL && !(row as any).onshapeID?.documentID,
        onButtonClick: (row: WorkOrderTableRow) => {
            let downloadUrl = "";
            if (row.exportSTL) {
                downloadUrl = `${import.meta.env.VITE_CLIENT_URL}/api/drive/file/${row.exportSTL}`;
            } else if ((row as any).onshapeID) {
                const { documentID, wvmType = "w", wvmID, elementID, partID } = (row as any).onshapeID;
                downloadUrl = `${import.meta.env.VITE_CLIENT_URL}/api/onshape/part/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/p/${partID}/stl`;
            }
            if (downloadUrl) {
                downloadFile(downloadUrl, `${row.name || "part"}.stl`);
            }
        },
    },
    {
        key: "exportParasolid",
        label: "Export Parasolid",
        type: "button",
        buttonText: "Download",
        isDisabled: (row: WorkOrderTableRow) => !row.exportParasolid && !(row as any).onshapeID?.documentID,
        onButtonClick: (row: WorkOrderTableRow) => {
            let downloadUrl = "";
            if (row.exportParasolid) {
                downloadUrl = `${import.meta.env.VITE_CLIENT_URL}/api/drive/file/${row.exportParasolid}`;
            } else if ((row as any).onshapeID) {
                const { documentID, wvmType = "w", wvmID, elementID, partID } = (row as any).onshapeID;
                downloadUrl = `${import.meta.env.VITE_CLIENT_URL}/api/onshape/part/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/p/${partID}/parasolid`;
            }
            if (downloadUrl) {
                downloadFile(downloadUrl, `${row.name || "part"}.parasolid`);
            }
        },
    },
];

export default WorkOrderColumns;