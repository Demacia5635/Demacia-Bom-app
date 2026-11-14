import mongoose from "mongoose";

const onshapeIDSchema = new mongoose.Schema(
  {
    documentID: { type: String, required: true },
    wvmType: { type: String, required: true },
    wvmID: { type: String, required: true },
    elementID: { type: String, required: true },
    bomID: { type: String, required: false },
  },
  {
    _id: false,
  },
);

const subPartSchema = new mongoose.Schema(
  {
    partID: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
  },
  { _id: false },
);

const subAseemblySchema = new mongoose.Schema(
  {
    bomID: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
  },
  { _id: false },
);

const bomSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },

    name: { type: String },
    catalogNumber: { type: String },
    projectCatalogNumber: { type: String },
    description: { type: String },
    engineer: { type: String },

    parts: { type: [subPartSchema], default: [] },
    subAssemblies: { type: [subAseemblySchema], default: [] },

    onshapeURL: { type: String },
    avatarID: { type: String },

    // Added fields to support Google Drive caching:
    driveFileId: { type: String, default: "" },
    // Model version (fingerprint of the tree's change markers) the saved
    // thumbnail was rendered from; unchanged -> not rendered again on publish.
    filesModelVersion: { type: String },
    imageUrl: { type: String, default: "" },

    comments: { type: String },
    onshapeID: { type: onshapeIDSchema, required: false },
    vendor: { type: String },
    // Marked as a standard (bought) part in the BOM extension, e.g. a motor:
    // its insides aren't loaded or published, and parent assemblies list it
    // under `parts` (a part record with the same id) instead of `subAssemblies`.
    markedStandard: { type: Boolean, default: false },
  },
  { _id: false, timestamps: true },
);

const Bom = mongoose.model("Bom", bomSchema);

export default Bom;