import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeSync } from "../util/misc/useThemeSync";

interface OnshapeIDData {
  documentID: string;
  wvmType: string;
  wvmID: string;
  elementID: string;
  partID: string;
}

interface ApiError {
  message: string;
  statusCode?: number;
}

export default function CreatePartPage() {
  const navigate = useNavigate();
  const { isLight, toggleTheme } = useThemeSync();

  const [id, setId] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [catalogNumber, setCatalogNumber] = useState<string>("");
  const [revision, setRevision] = useState<string>("1");
  const [engineer, setEngineer] = useState<string>("");
  const [material, setMaterial] = useState<string>("");
  const [mass, setMass] = useState<number | "">(0);
  const [price, setPrice] = useState<number | "">(0);
  const [description, setDescription] = useState<string>("");
  const [comments, setComments] = useState<string>("");

  const [onshapeURL, setOnshapeURL] = useState<string>("");
  const [stlLink, setStlLink] = useState<string>("");
  const [parasolidLink, setParasolidLink] = useState<string>("");

  const [onshapeID, setOnshapeID] = useState<OnshapeIDData>({
    documentID: "",
    wvmType: "",
    wvmID: "",
    elementID: "",
    partID: "",
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!id.trim()) {
      setError({ message: "Part ID is required." });
      return;
    }

    const secret = import.meta.env.VITE_CLIENT_SECRET;
    if (!secret) {
      setError({ message: "VITE_CLIENT_SECRET is missing from environment variables." });
      return;
    }

    const hasOnshapeData = Object.values(onshapeID).some((val) => val.trim() !== "");

    const payload = {
      id: id.trim(),
      name: name.trim(),
      catalogNumber: catalogNumber.trim(),
      revision: revision.trim(),
      engineer: engineer.trim(),
      material: material.trim(),
      mass: typeof mass === "number" ? mass : 0,
      price: typeof price === "number" ? price : 0,
      description: description.trim(),
      comments: comments.trim(),
      onshapeURL: onshapeURL.trim(),
      stlLink: stlLink.trim(),
      parasolidLink: parasolidLink.trim(),
      ...(hasOnshapeData ? { onshapeID } : {}),
    };

    setLoading(true);

    try {
      const response = await fetch(`http://localhost:5050/api/db/part/id/${id.trim()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-secret": secret,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw {
          message: `Failed to create Part: ${response.statusText}`,
          statusCode: response.status,
        } as ApiError;
      }

      navigate("/");
    } catch (err: any) {
      if (err.statusCode) {
        setError(err);
      } else {
        setError({ message: err.message || "An unexpected error occurred." });
      }
    } finally {
      setLoading(false);
    }
  };

  const cardBg = isLight ? "bg-white border-zinc-200" : "bg-zinc-900 border-zinc-800";
  const inputBg = isLight ? "bg-zinc-50 border-zinc-300 text-zinc-900" : "bg-zinc-950 border-zinc-800 text-zinc-100";
  const textHeading = isLight ? "text-zinc-900" : "text-zinc-100";
  const textMuted = isLight ? "text-zinc-500" : "text-zinc-400";

  return (
    <div className={`p-8 max-w-4xl mx-auto min-h-screen transition-colors duration-200 ${isLight ? "bg-zinc-50" : "bg-zinc-950 text-zinc-100"}`}>
      <div className="flex justify-between items-center mb-6">
        <button
          type="button"
          onClick={() => navigate("/")}
          className={`px-4 py-2 rounded font-medium text-sm ${isLight ? "bg-zinc-200 hover:bg-zinc-300 text-zinc-800" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"}`}
        >
          ← Back to Home
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className={`px-3 py-2 rounded font-medium text-sm ${isLight ? "bg-zinc-200 hover:bg-zinc-300 text-zinc-800" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"}`}
        >
          {isLight ? "🌙 Dark Mode" : "☀️ Light Mode"}
        </button>
      </div>

      <h1 className={`text-2xl font-bold mb-6 ${textHeading}`}>Create New Part</h1>

      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
          <p className="font-semibold">Error Creating Part</p>
          <p>{error.message}</p>
          {error.statusCode && <p className="text-sm">HTTP Status Code: {error.statusCode}</p>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className={`${cardBg} border rounded-xl p-6 space-y-4 shadow-sm`}>
          <h2 className={`text-lg font-bold ${textHeading}`}>General Properties</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>Part ID (Required)</label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
                placeholder="e.g. PART-1001"
              />
            </div>
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
                placeholder="e.g. Mounting Bracket"
              />
            </div>
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>Catalog Number</label>
              <input
                type="text"
                value={catalogNumber}
                onChange={(e) => setCatalogNumber(e.target.value)}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
                placeholder="e.g. CAT-P100"
              />
            </div>
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>Revision</label>
              <input
                type="text"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
                placeholder="1"
              />
            </div>
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>Engineer</label>
              <input
                type="text"
                value={engineer}
                onChange={(e) => setEngineer(e.target.value)}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
                placeholder="e.g. Jane Doe"
              />
            </div>
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>Material</label>
              <input
                type="text"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
                placeholder="e.g. Aluminum 6061-T6"
              />
            </div>
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>Mass (kg)</label>
              <input
                type="number"
                step="any"
                value={mass}
                onChange={(e) => setMass(e.target.value === "" ? "" : parseFloat(e.target.value))}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
              />
            </div>
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>Price ($)</label>
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value === "" ? "" : parseFloat(e.target.value))}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-xs ${textMuted} mb-1`}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
              rows={2}
            />
          </div>

          <div>
            <label className={`block text-xs ${textMuted} mb-1`}>Comments</label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
              rows={2}
            />
          </div>
        </div>

        <div className={`${cardBg} border rounded-xl p-6 space-y-4 shadow-sm`}>
          <h2 className={`text-lg font-bold ${textHeading}`}>CAD & Export Links</h2>
          <div className="space-y-4">
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>Onshape URL</label>
              <input
                type="text"
                value={onshapeURL}
                onChange={(e) => setOnshapeURL(e.target.value)}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
                placeholder="https://cad.onshape.com/documents/..."
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-xs ${textMuted} mb-1`}>STL File ID (Google Drive)</label>
                <input
                  type="text"
                  value={stlLink}
                  onChange={(e) => setStlLink(e.target.value)}
                  className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
                  placeholder="Drive File ID for STL"
                />
              </div>
              <div>
                <label className={`block text-xs ${textMuted} mb-1`}>Parasolid File ID (Google Drive)</label>
                <input
                  type="text"
                  value={parasolidLink}
                  onChange={(e) => setParasolidLink(e.target.value)}
                  className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
                  placeholder="Drive File ID for Parasolid"
                />
              </div>
            </div>
          </div>
        </div>

        <div className={`${cardBg} border rounded-xl p-6 space-y-4 shadow-sm`}>
          <h2 className={`text-lg font-bold ${textHeading}`}>Onshape ID Properties</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>Document ID</label>
              <input
                type="text"
                value={onshapeID.documentID}
                onChange={(e) => setOnshapeID({ ...onshapeID, documentID: e.target.value })}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
              />
            </div>
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>WVM Type</label>
              <input
                type="text"
                value={onshapeID.wvmType}
                onChange={(e) => setOnshapeID({ ...onshapeID, wvmType: e.target.value })}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
              />
            </div>
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>WVM ID</label>
              <input
                type="text"
                value={onshapeID.wvmID}
                onChange={(e) => setOnshapeID({ ...onshapeID, wvmID: e.target.value })}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
              />
            </div>
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>Element ID</label>
              <input
                type="text"
                value={onshapeID.elementID}
                onChange={(e) => setOnshapeID({ ...onshapeID, elementID: e.target.value })}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
              />
            </div>
            <div>
              <label className={`block text-xs ${textMuted} mb-1`}>Part ID (Onshape Entity ID)</label>
              <input
                type="text"
                value={onshapeID.partID}
                onChange={(e) => setOnshapeID({ ...onshapeID, partID: e.target.value })}
                className={`w-full ${inputBg} border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium ${isLight ? "bg-zinc-200 hover:bg-zinc-300 text-zinc-700" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            {loading ? "Creating..." : "Create Part"}
          </button>
        </div>
      </form>
    </div>
  );
}