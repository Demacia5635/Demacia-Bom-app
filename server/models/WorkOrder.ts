import mongoose from "mongoose";

const subPartSchema = new mongoose.Schema(
  {
    partID: { type: String, required: true },
    quantityTotal: { type: Number, default: 1 },
    quantityMade: { type: Number, default: 1 },
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

const workOrderSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },

    name: { type: String },
    bomID: { type: String },
    workOrderOwner: { type: String },
    description: { type: String },

    parts: { type: [subPartSchema], default: [] },

    avatarID: { type: String },

    comments: { type: String },
  },
  { _id: false, timestamps: true },
);

const WorkOrder = mongoose.model("Work Order", workOrderSchema);

export default WorkOrder;