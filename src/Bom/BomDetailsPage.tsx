import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Table from "../components/Table";
import { fetchFromApi, type ApiError } from "../util/ApiService";
import { useThemeSync } from "../util/misc/useThemeSync";
import type { BomModel, PartModel } from "../util/Models";
import type BomTableRow from "./BomTableRow";
import MainBomDataUI from "./MainBomDataUI";
import BomColumns from "./BomColumns";

export default function BomDetailsPage() {
  const { bomId } = useParams<{ bomId: string }>();
  const { isLight, toggleTheme } = useThemeSync();

  const [rows, setRows] = useState<BomTableRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [mainBomData, setMainBomData] = useState<BomModel | null>(null);

  useEffect(() => {
    if (!bomId) return;

    fetchFromApi<BomModel>(`/db/bom/id/${bomId}`).then((bom) => {
      setMainBomData(bom);
    });
  }, [bomId]);

  useEffect(() => {
    if (!bomId) return;

    const visitedBoms = new Set<string>();

    async function fetchBomRecursively(
      targetBomId: string,
      parentId: string | null = null
    ): Promise<BomTableRow[]> {
      if (visitedBoms.has(targetBomId)) return [];
      visitedBoms.add(targetBomId);

      const bom = await fetchFromApi<BomModel>(`/db/bom/id/${targetBomId}`);
      const currentAssemblyRowId = `${parentId ? parentId + "-" : ""}${bom.id}`;

      let assemblyAvatarUrl = "";
      if (bom?.onshapeID?.documentID && bom?.onshapeID?.elementID) {
        const { documentID, wvmType = "w", wvmID, elementID } = bom.onshapeID;
        assemblyAvatarUrl = `/api/onshape/bom/d/${documentID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elementID}/thumbnail`;
      } else if (bom?.avatarID) {
        assemblyAvatarUrl = `/drive/file/id/${bom.avatarID}`;
      }

      const assemblyRow: BomTableRow = {
        id: currentAssemblyRowId,
        parentId: parentId === bomId ? null : parentId,
        isExpanded: true,
        avatar: assemblyAvatarUrl,
        name: bom.name || targetBomId,
        catalogNumber: bom.catalogNumber || "",
        revision: "-",
        description: bom.description || "",
        engineer: bom.engineer || "",
        material: "-",
        mass: 0,
        price: 0,
        quantity: 1,
        comments: bom.comments || "",
        documentID: bom.onshapeID?.documentID || "",
        wvmType: bom.onshapeID?.wvmType || "",
        wvmID: bom.onshapeID?.wvmID || "",
        elementID: bom.onshapeID?.elementID || "",
        entityID: bom.onshapeID?.bomID || "",
        onshapeURL: bom.onshapeURL || "",
        exportSTL: "",
        exportParasolid: "",
        vendor: bom.vendor || "",
      };

      const collectedRows: BomTableRow[] = targetBomId === bomId ? [] : [assemblyRow];

      for (const sub of bom.subAssemblies || []) {
        const subRows = await fetchBomRecursively(sub.bomID, currentAssemblyRowId);
        collectedRows.push(...subRows);
      }

      for (const p of bom.parts || []) {
        const part = await fetchFromApi<PartModel>(`/db/part/id/${p.partID}`);

        // Robust fallback mapping for part Onshape IDs
        let partAvatarUrl = "";
        const docID = part?.onshapeID?.documentID;
        const elemID = part?.onshapeID?.elementID;
        
        if (docID && elemID) {
          const wvmType = part.onshapeID?.wvmType || "w";
          const wvmID = part.onshapeID?.wvmID || "";
          // Ensure we target the exact part ID from onshapeID, or fallback to the BOM item partID
          const targetPartID = part.onshapeID?.partID || p.partID;
          
          partAvatarUrl = `/api/onshape/part/d/${docID}/wvmT/${wvmType}/wvmI/${wvmID}/e/${elemID}/p/${targetPartID}/thumbnail`;
        } else if (part?.avatarID) {
          partAvatarUrl = `/drive/file/id/${part.avatarID}`;
        }

        const partRow: BomTableRow = {
          id: `${currentAssemblyRowId}-part-${part.id}`,
          parentId: currentAssemblyRowId === bomId ? null : currentAssemblyRowId,
          isExpanded: false,
          avatar: partAvatarUrl,
          name: part.name || p.partID,
          catalogNumber: part.catalogNumber || "",
          revision: part.revision || "",
          description: part.description || "",
          engineer: part.engineer || "",
          material: part.material || "",
          mass: part.mass || 0,
          price: part.price || 0,
          quantity: p.quantity || 1,
          comments: part.comments || "",
          documentID: part.onshapeID?.documentID || "",
          wvmType: part.onshapeID?.wvmType || "",
          wvmID: part.onshapeID?.wvmID || "",
          elementID: part.onshapeID?.elementID || "",
          entityID: part.onshapeID?.partID || "",
          onshapeURL: part.onshapeURL || "",
          exportSTL: part.stlLink || "",
          exportParasolid: part.parasolidLink || "",
          vendor: part.vendor || ""
        };
        collectedRows.push(partRow);
      }
      return collectedRows;
    }

    setLoading(true);
    fetchBomRecursively(bomId)
      .then((data) => setRows(data))
      .catch((err: ApiError) => setError(err))
      .finally(() => setLoading(false));
  }, [bomId]);

  const pageBg = isLight ? "bg-zinc-50 text-zinc-900" : "bg-zinc-950 text-zinc-100";
  const loadingText = isLight ? "text-zinc-500" : "text-zinc-400";

  return (
    <div className={`p-8 min-h-screen transition-colors duration-200 ${pageBg}`}>
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={toggleTheme}
          className={`px-3 py-2 rounded font-medium text-sm ${isLight ? "bg-zinc-200 hover:bg-zinc-300 text-zinc-800" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"}`}
        >
          {isLight ? "🌙 Dark Mode" : "☀️ Light Mode"}
        </button>
      </div>

      {mainBomData && (
        <MainBomDataUI bom={mainBomData} />
      )}
      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
          <p className="font-semibold">Error Loading BOM Data</p>
          <p>{error.message}</p>
          {error.statusCode && <p className="text-sm">HTTP Status Code: {error.statusCode}</p>}
        </div>
      )}

      {loading ? (
        <div className={`p-8 text-center ${loadingText}`}>Recursively fetching BOM tree...</div>
      ) : (
        <Table
          data={rows}
          columnsData={BomColumns}
          setData={(newData) => {
            return setRows(newData as BomTableRow[]);
          }}
          newRowFunction={undefined}
          initialSort={{ key: "catalogNumber", direction: "asc" }}
        />
      )}
    </div>
  );
}