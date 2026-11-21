import { useEffect, useState } from "react";
import { fetchFromApi, type ApiError } from "../../util/ApiService";
import { useThemeSync } from "../../util/misc/useThemeSync";
import BomTable from "./BomTable";
import type { BomModel, PartModel } from "../../util/Models";
import { isMadeRecord, splitStandard } from "../../util/standardItems";
import ErrorBanner, { ApiErrorText } from "../../components/ErrorBanner";

export type BomSummary = Omit<BomModel, 'description' | 'comments' | 'onshapeURL' | 'onshapeID' | 'parts' | 'subAssemblies' | 'createdAt'>;

export default function BomsPage() {
  const { isLight } = useThemeSync();

  const [boms, setBoms] = useState<BomSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    Promise.all([
      fetchFromApi<BomModel[]>("/db/bom/all"),
      // Only to recognise standard sub-assemblies by their part record; the
      // BOMs' own marks still work if this fails.
      fetchFromApi<PartModel[]>("/db/part/all").catch(() => [] as PartModel[]),
    ])
      .then(([data, parts]) => {
        // Standard (bought) sub-assemblies and their insides are on the Standard Parts page.
        const split = splitStandard(data, parts);
        const sorted = data
          .filter((bom) => isMadeRecord(split, bom.id))
          .sort((a, b) => {
            const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return timeB - timeA;
          });
        setBoms(sorted);
      })
      .catch((err: ApiError) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  const textHeading = isLight ? "text-zinc-900" : "text-zinc-100";

  if (loading) {
    return <div className={`p-8 text-center min-h-screen transition-colors duration-200 ${isLight ? "bg-zinc-50 text-zinc-500" : "bg-zinc-950 text-zinc-400"}`}>Loading BOMs...</div>;
  }

  return (
    <div className={`p-8 max-w-7xl mx-auto min-h-screen transition-colors duration-200 ${isLight ? "bg-zinc-50" : "bg-zinc-950 text-zinc-100"}`}>
      <div className="flex justify-between items-center mb-6">
        <h1 className={`text-2xl font-bold ${textHeading}`}>Boms</h1>
        
      </div>

      {error && (
        <ErrorBanner title="Error Loading BOMs" className="mb-6 p-4 rounded-lg">
          <ApiErrorText error={error} />
        </ErrorBanner>
      )}

      {/* After a failed load the error says why; an empty table would only add "no BOMs". */}
      {!error && <BomTable boms={boms} />}
    </div>
  );
}