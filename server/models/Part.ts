import mongoose from "mongoose";

const onshapeIDSchema = new mongoose.Schema(
  {
    documentID: { type: String, required: true },
    wvmType: { type: String, enum: ["w", "v", "m"], required: true },
    wvmID: { type: String, required: true },
    elementID: { type: String, required: true },
    partID: { type: String, required: true },
  },
  { _id: false },
);

const partSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    // Who saved it last (X-Updated-By): a convenience, not an audit trail.
    updatedBy: { type: String },

    name: { type: String },
    catalogNumber: { type: String },
    revision: { type: String },
    description: { type: String },
    engineer: { type: String },

    material: { type: String },
    mass: { type: Number },
    // Bounding box in Onshape, longest side first, e.g. "25 × 8 × 8 mm"
    // (set by Publish BOM in the extension; see src/util/partSize.ts).
    size: { type: String },
    price: { type: Number },
    productionType: { type: Number },

    onshapeURL: { type: String },
    avatarID: { type: String },

    stlLink: { type: String },
    parasolidLink: { type: String },
    links: { type: String },

    comments: { type: String },
    onshapeID: { type: onshapeIDSchema, required: false },
    vendor: { type: String },
    // Onshape Standard Content (screws, nuts, washers...): bought, not made.
    isStandardContent: { type: Boolean, default: false },
    // Marked as a standard (bought) part in the BOM extension, e.g. a bearing
    // or motor modelled in a team document. Such parts are saved with
    // isStandardContent true too. A marked sub-assembly is also saved as a
    // part (same id as its assembly record) so it lists as one bought item.
    markedStandard: { type: Boolean, default: false },

    // Which files Publish BOM keeps for this part (set in the BOM extension).
    // Absent on parts saved before these choices existed.
    wantStl: { type: Boolean },
    wantParasolid: { type: Boolean },
    // Model version (Part Studio change marker + configuration) the saved
    // thumbnail/STL/Parasolid were made from; unchanged -> not re-exported.
    filesModelVersion: { type: String },

    driveFileId: { type: String },
    imageUrl: { type: String },
  },
  {timestamps: true },
);

const Part = mongoose.model("Part", partSchema);

export default Part;