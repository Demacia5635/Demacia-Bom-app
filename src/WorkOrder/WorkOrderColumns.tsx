import type { ColumnConfig } from "../components/Table";
import { downloadFile } from "../util/ApiService";
import type WorkOrderTableRow from "./WorkOrderTableRow";

const WorkOrderColumns: ColumnConfig[] = [
    { key: "avatar", label: "Avatar", type: "image", isDisabled: (row) => row.vendor !== "" },
    { key: "lastUpdate", label: "Last Update", type: "string", isDisabled: () => true },
    { key: "productionMakingOwner", label: "Production Making Owner", type: "string" },
    { key: "catalogNumber", label: "Catalog Number", type: "string", isDisabled: (row) => row.vendor !== "" },
    { key: "name", label: "Name", type: "string", isDisabled: (row) => row.vendor !== "" },
    { key: "quantityTotal", label: "Quantity Total", type: "number" },
    { key: "statusCode", label: "Status Code", type: "select", options: ['0', '1', '2'] },
    // date for part manufacturing finish
    // manufacturing method
    // importance
    { key: "comments", label: "Comments", type: "string" },
    // { key: "documentID", label: "Onshape Doc ID", type: "string", isDisabled: () => true },
    // { key: "wvmType", label: "WVM Type", type: "string", isDisabled: () => true },
    // { key: "wvmID", label: "WVM ID", type: "string", isDisabled: () => true },
    // { key: "elementID", label: "Element ID", type: "string", isDisabled: () => true },
    // { key: "entityID", label: "Part ID", type: "string", isDisabled: () => true },
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
    // Export File Action (Disabled Property)
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
