import type { RowData } from "../components/Table";

export default interface WorkOrderTableRow extends RowData {
    avatar: string;
    lastUpadte: Date | string;
    productionMakingOwner: string;
    catalogNumber: string;
    name: string;
    quantityTotal: number;
    statusCode: string;
    approxArrivalDate: string;     
    manufacturingMethod: string;  
    importance: string;             
    comments: string;
    onshapeURL: string;
    exportSTL: string;
    exportParasolid: string;
    vendor: string;
}