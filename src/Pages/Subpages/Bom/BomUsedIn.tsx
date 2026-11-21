import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFromApi } from "../../../util/ApiService";
import { bomPath } from "../../../util/bomTrail";
import { useThemeClasses } from "../../../util/misc/useThemeClasses";
import { AssemblyThumb } from "./BomBreadcrumbs";

interface UsedInEntry {
  id: string;
  name?: string;
  catalogNumber?: string;
  quantity?: number;
  driveFileId?: string;
  avatarID?: string;
  imageUrl?: string;
  thumbnailURL?: string;
}

/**
 * "Used in" on the BOM page (QW3): the assemblies that list this one as a
 * sub-assembly, each with its picture and a link. Hidden when the server
 * doesn't have the route yet (an older server answers 404).
 */
export default function BomUsedIn({ bomId }: { bomId: string }) {
  const theme = useThemeClasses();
  const [parents, setParents] = useState<UsedInEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFromApi<UsedInEntry[]>(`/db/bom/usedIn/${encodeURIComponent(bomId)}`)
      .then((list) => { if (!cancelled) setParents(list || []); })
      .catch(() => { /* older server, or offline: leave it out */ });
    return () => {
      cancelled = true;
    };
  }, [bomId]);

  if (!parents) return null;
  return (
    <section aria-label="Used in" className={`mb-4 rounded-xl border px-4 py-3 text-sm ${theme.card}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className={`text-xs font-semibold uppercase tracking-wide ${theme.textLabel}`}>Used in ({parents.length})</h2>
        {parents.length === 0 && <span className={`text-xs ${theme.textMuted}`}>No other assembly uses this one.</span>}
        {parents.map((p) => (
          <Link
            key={p.id}
            to={bomPath(p.id)}
            className={`inline-flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 hover:border-blue-500 hover:text-blue-500 ${theme.border} ${theme.textValue}`}
          >
            <AssemblyThumb record={p} />
            <span className="font-medium">{p.name || p.id}</span>
            {p.quantity != null && p.quantity !== 1 && <span className={`text-xs ${theme.textMuted}`}>×{p.quantity}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}
