import mongoose from "mongoose";

const subPartSchema = new mongoose.Schema(
  {
    partID: { type: String, required: true },
    quantityTotal: { type: Number, default: 1 },
    // Nothing is made yet when a part enters a work order (also when it's
    // added later by the per-part route, which doesn't send this field).
    quantityMade: { type: Number, default: 0 },
    statusCode: { type: mongoose.Schema.Types.Mixed, default: "In Planning" },
    Priority: { type: String, default: "Medium" },
    manufacturingMethod: { type: String, default: "Manual" },
    productionGCOwner: { type: String },
    productionMakingOwner: { type: String },
    comments: { type: String },
    links: { type: String },                 // Added Links schema definition
    approxArrivalDate: { type: String },     // Added Arrival Date schema definition
    updatedAt: { type: Date },
    createdAt: { type: Date },
  },
  { _id: false },
);

// Parts of the work order cut together in one CNC run (same thickness and
// material): they share one G-code link. Kept apart from parts[], so a part's
// own links come back when it leaves a group. Written only by
// POST /id/:id/cncGroup (never by the whole-work-order save).
const cncGroupSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    partIDs: { type: [String], default: [] },
    links: { type: String, default: "" },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  { _id: false },
);

const workOrderSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },

    name: { type: String },
    bomID: { type: String },
    workOrderOwner: { type: String },
    description: { type: String },

    parts: { type: [subPartSchema], default: [] },
    cncGroups: { type: [cncGroupSchema], default: [] },

    avatarID: { type: String },

    comments: { type: String },
  },
  { _id: false, timestamps: true },
);

const WorkOrder = mongoose.model("Work Order", workOrderSchema);

export default WorkOrder;