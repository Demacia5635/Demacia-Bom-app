import type { RowData } from "../../../components/Table";

export default interface WorkOrderTableRow extends RowData {
    avatar: string;
    lastUpadte: Date | string;
    productionMakingOwner: string;
    catalogNumber: string;
    name: string;
    /** Bounding box from Onshape, e.g. "25 × 8 × 8 mm" (util/partSize); "" when unknown. */
    size?: string;
    quantityTotal: number;
    statusCode: string;
    approxArrivalDate: string;     
    manufacturingMethod: string;  
    material: string;
    Priority: string;             
    comments: string;
    links: string;
    onshapeURL: string;
    exportSTL: string;
    exportParasolid: string;
    vendor: string;
    /** Onshape Standard Content (screws, nuts...): purchased, so its name and method are fixed. */
    isStandardContent?: boolean;
}