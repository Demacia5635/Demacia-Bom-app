import { useEffect, useState } from "react";
import { fetchFromApi, type ApiError } from "../util/ApiService";
import { useThemeSync } from "../util/misc/useThemeSync";
import BomCard from "./BomCard";
import WorkOrderCard from "./WorkOrderCard";
import type { BomModel, WorkorderModel } from "../util/Models";

export type BomSummary = Omit<BomModel, 'description' | 'comments' | 'onshapeURL' | 'onshapeID' | 'parts' | 'subAssemblies' | 'createdAt'>;
export type WorkorderSummary = Omit<WorkorderModel, 'bomID' | 'description' | 'parts' | 'comments' | 'createdAt'>

export default function HomeScreen() {
  const { isLight, toggleTheme } = useThemeSync();

  const [boms, setBoms] = useState<BomSummary[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkorderSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    fetchFromApi<BomSummary[]>("/db/bom/all")
      .then((data) => {
        const sorted = data.sort((a, b) => {
          const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return timeB - timeA;
        });
        setBoms(sorted);
      })
      .catch((err: ApiError) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchFromApi<WorkorderSummary[]>("/db/workOrder/all")
      .then((data) => {
        const sorted = data.sort((a, b) => {
          const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return timeB - timeA;
        });
        setWorkOrders(sorted);
      })
      .catch((err: ApiError) => setError(err))
      .finally(() => setLoading(false));
  }, [])

  const textHeading = isLight ? "text-zinc-900" : "text-zinc-100";
  const loadingText = isLight ? "text-zinc-500" : "text-zinc-400";

  if (loading) {
    return <div className={`p-8 text-center min-h-screen transition-colors duration-200 ${isLight ? "bg-zinc-50 text-zinc-500" : "bg-zinc-950 text-zinc-400"}`}>Loading BOMs and Work Orders...</div>;
  }

  return (
    <div className={`p-8 max-w-7xl mx-auto min-h-screen transition-colors duration-200 ${isLight ? "bg-zinc-50" : "bg-zinc-950 text-zinc-100"}`}>
      <div className="flex justify-between items-center mb-6">
        <h1 className={`text-2xl font-bold ${textHeading}`}>Boms</h1>
        <button
          type="button"
          onClick={toggleTheme}
          className={`px-3 py-2 rounded font-medium text-sm ${isLight ? "bg-zinc-200 hover:bg-zinc-300 text-zinc-800" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"}`}
        >
          {isLight ? "🌙 Dark Mode" : "☀️ Light Mode"}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
          <p className="font-semibold">Error Loading BOMs</p>
          <p>{error.message}</p>
          {error.statusCode && <p className="text-sm">HTTP Status Code: {error.statusCode}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {boms.map((bom) => <BomCard key={bom.id} bom={bom} />)}
      </div>

      <br/>

      <h1 className={`text-2xl font-bold mb-6 mt-6 ${textHeading}`}>Work Orders</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workOrders.map((workOrder) => <WorkOrderCard key={workOrder.id} workOrder={workOrder} />)}
      </div>
    </div>
  );
}