import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthenticatedImage } from "../../../components/AuthenticatedImage";
import type { BomModel } from "../../../util/Models";
import { bomPath } from "../../../util/bomTrail";
import { useThemeClasses } from "../../../util/misc/useThemeClasses";
import { recordImageSrc } from "../../../util/recordImage";
import { fetchBomsByIds } from "../../../util/records";

/** An assembly's small picture (a placeholder box when it has none). */
export function AssemblyThumb({ record }: { record: Parameters<typeof recordImageSrc>[0] }) {
  const theme = useThemeClasses();
  const src = recordImageSrc(record);
  return (
    <span className={`inline-flex w-6 h-6 shrink-0 rounded overflow-hidden border items-center justify-center ${theme.imageBox}`}>
      {src ? <AuthenticatedImage src={src} alt="" className="w-full h-full object-cover" /> : null}
    </span>
  );
}

/**
 * BOMs › Robot › Arm › Gripper above the BOM page's header (QW3): the path of
 * assemblies you came through, each with its picture and a link back.
 */
export default function BomBreadcrumbs({ trail, current }: { trail: string[]; current: BomModel }) {
  const theme = useThemeClasses();
  const [records, setRecords] = useState<{ key: string; boms: Map<string, BomModel> } | null>(null);
  const key = trail.join(",");
  const boms = records?.key === key ? records.boms : null;

  useEffect(() => {
    if (trail.length === 0) return;
    let cancelled = false;
    fetchBomsByIds(trail)
      .then((found) => { if (!cancelled) setRecords({ key, boms: found }); })
      .catch(() => { if (!cancelled) setRecords({ key, boms: new Map() }); });
    return () => {
      cancelled = true;
    };
    // `key` stands for the trail's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const crumb = `inline-flex items-center gap-1.5 hover:text-blue-500 ${theme.textMuted}`;
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-sm">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li><Link to="/home" className={crumb}>BOMs</Link></li>
        {trail.map((id, i) => {
          const bom = boms?.get(id);
          return (
            <li key={`${i}-${id}`} className="inline-flex items-center gap-2">
              <span aria-hidden="true" className={theme.textMuted}>›</span>
              <Link to={bomPath(id, trail.slice(0, i))} className={crumb}>
                <AssemblyThumb record={bom} />
                {bom?.name || (boms ? id : "…")}
              </Link>
            </li>
          );
        })}
        <li className="inline-flex items-center gap-2">
          <span aria-hidden="true" className={theme.textMuted}>›</span>
          <span aria-current="page" className={`inline-flex items-center gap-1.5 font-semibold ${theme.textHeading}`}>
            <AssemblyThumb record={current} />
            {current.name || current.id}
          </span>
        </li>
      </ol>
    </nav>
  );
}
