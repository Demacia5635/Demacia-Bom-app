import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    
    // User-specific Onshape credentials
    onshapeAccessKey: { type: String },
    onshapeSecretKey: { type: String }, // Stored encrypted via AES-256
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;