/**
 * Parts no assembly uses (server: GET /db/part/orphans), with everything
 * saved about each one and a Delete button per part (admin secret).
 *
 * Route /orphans - deliberately not linked from the sidebar or anywhere else.
 */
import { useEffect, useMemo, useState } from "react";
import { downloadDriveFile, fetchFromApi, type ApiError } from "../../util/ApiService";
import type { PartModel } from "../../util/Models";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { recordImageSrc } from "../../util/recordImage";
import { driveFileAttrs } from "../../util/driveLinks";
import { openExternal } from "../../util/openExternal";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import ErrorBanner, { ApiErrorText } from "../../components/ErrorBanner";
import RecordDialog from "../../components/RecordDialog";
import PartPortal from "../SearchPartsPage/PartPortal";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import DeleteOrphanDialog from "./DeleteOrphanDialog";
import { BulkDeleteBar, BulkDeleteButton } from "../../components/bulkDelete/BulkDeleteBar";
import { useBulkSelection } from "../../components/bulkDelete/useBulkSelection";
import { revisionLabel } from "../../util/partRevision";

export interface OrphanPart extends PartModel {
  /** How many of its Drive files no other record points at (they go to the Drive trash on delete). */
  filesToTrash?: number;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
}

/** Bought: Onshape Standard Content, marked standard in the extension, or from a vendor. */
function boughtLabel(part: PartModel): string {
  const kinds = [
    part.isStandardContent && !part.markedStandard ? "Standard Content" : "",
    part.markedStandard ? "Marked standard" : "",
    part.vendor ? `Vendor: ${part.vendor}` : "",
  ].filter(Boolean);
  return kinds.length > 0 ? kinds.join(" · ") : "No (made)";
}

/** Whether the filter box text matches a part (name, catalog #, material, engineer, vendor). */
function matchesFilter(p: OrphanPart, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || [p.name, p.catalogNumber, p.material, p.engineer, p.vendor].some((v) => v?.toLowerCase().includes(q));
}

export default function OrphansPage() {
  const theme = useThemeClasses();
  useDocumentTitle("Parts in no assembly");
  const [parts, setParts] = useState<OrphanPart[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openPart, setOpenPart] = useState<PartModel | null>(null);
  /** The parts in the Delete dialog: one (its card's Delete) or several (Bulk delete). */
  const [deleting, setDeleting] = useState<OrphanPart[] | null>(null);
  /** Bulk delete: checkboxes show on the cards; only parts the filter shows can be selected. */
  const bulk = useBulkSelection();

  // Loads on open and on each Reload (which sets `loading` first).
  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchFromApi<OrphanPart[]>("/db/part/orphans")
      .then((list) => { if (!cancelled) setParts(list ?? []); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  const shown = useMemo(() => (parts ?? []).filter((p) => matchesFilter(p, search)), [parts, search]);
  const selectedShown = bulk.selectedOf(shown, (p) => p.id);

  // A part the filter hides is unselected, so nothing hidden is ever deleted.
  const changeSearch = (value: string) => {
    setSearch(value);
    bulk.keepOnly((parts ?? []).filter((p) => matchesFilter(p, value)).map((p) => p.id));
  };
  const handleDeleted = (ids: string[]) => {
    const gone = new Set(ids);
    setParts((list) => list?.filter((p) => !gone.has(p.id)) ?? list);
    bulk.keepOnly((parts ?? []).map((p) => p.id).filter((id) => !gone.has(id)));
  };

  return (
    <div className={`min-h-screen p-4 sm:p-6 transition-colors duration-200 ${theme.page}`}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Parts in no assembly</h1>
            <p className={`text-xs ${theme.textMuted}`}>
              Saved parts that no BOM lists. Deleting one also moves its Drive files to the trash, unless another record uses them.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => changeSearch(e.target.value)}
              placeholder="Filter by name, catalog #, material…"
              className={`border rounded-lg px-3 py-2 text-sm w-full sm:w-64 ${theme.input}`}
            />
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError(null);
                setReloads((n) => n + 1);
              }}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold"
            >
              {loading ? "Loading..." : "Reload"}
            </button>
            {!bulk.selectMode && <BulkDeleteButton onClick={bulk.start} disabled={shown.length === 0} />}
          </div>
        </div>

        {error != null && (
          <ErrorBanner title="Couldn't load the parts" className="p-4 rounded-lg">
            <ApiErrorText error={error as ApiError} />
          </ErrorBanner>
        )}

        {parts && (
          <p className={`text-sm ${theme.textLabel}`}>
            {parts.length === 0
              ? "Every saved part is in an assembly."
              : shown.length === parts.length
                ? `${parts.length} part${parts.length === 1 ? "" : "s"}, newest first.`
                : `Showing ${shown.length} of ${parts.length} parts.`}
          </p>
        )}

        {loading && !parts && <p className={`text-sm ${theme.textMuted}`}>Loading...</p>}

        {bulk.selectMode && (
          <BulkDeleteBar
            shownCount={shown.length}
            selectedCount={selectedShown.length}
            noun="parts"
            onDeleteAll={() => setDeleting(shown)}
            onDeleteSelected={() => setDeleting(selectedShown)}
            onCancel={bulk.cancel}
          />
        )}

        <ul className="space-y-3">
          {shown.map((part) => (
            <OrphanCard
              key={part.id}
              part={part}
              onOpen={() => setOpenPart(part)}
              onDelete={() => setDeleting([part])}
              selection={bulk.selectMode ? { checked: bulk.isSelected(part.id), onToggle: () => bulk.toggle(part.id) } : undefined}
            />
          ))}
        </ul>
      </div>

      {openPart && (
        <RecordDialog onClose={() => setOpenPart(null)}>
          <PartPortal
            key={openPart.id}
            part={openPart}
            onSaved={(saved: PartModel) => setParts((list) => list?.map((p) => (p.id === saved.id ? { ...p, ...saved } : p)) ?? list)}
          />
        </RecordDialog>
      )}

      {deleting && (
        <DeleteOrphanDialog
          parts={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

function OrphanCard({ part, onOpen, onDelete, selection }: {
  part: OrphanPart;
  onOpen: () => void;
  onDelete: () => void;
  /** Bulk delete's checkbox (only in its selection mode). */
  selection?: { checked: boolean; onToggle: () => void };
}) {
  const theme = useThemeClasses();
  const imageSrc = recordImageSrc(part);
  const name = part.name || part.catalogNumber || part.id;

  const fields: [string, React.ReactNode][] = [
    ["Revision", revisionLabel(part)],
    ["Engineer", part.engineer],
    ["Material", part.material],
    ["Mass", part.mass != null && part.mass !== 0 ? `${part.mass} kg` : ""],
    ["Size", part.size],
    ["Price", part.price ? `$${part.price}` : ""],
    ["Bought", boughtLabel(part)],
    ["Keeps STL / Parasolid", [part.wantStl ? "STL" : "", part.wantParasolid ? "Parasolid" : ""].filter(Boolean).join(", ") || (part.wantStl === false && part.wantParasolid === false ? "Neither" : "")],
    ["Description", part.description],
    ["Comments", part.comments],
    ["Links", part.links],
    ["Created", formatDate(part.createdAt)],
    ["Updated", [formatDate(part.updatedAt), part.updatedBy ? `by ${part.updatedBy}` : ""].filter(Boolean).join(" ")],
  ];

  const fileButton = "px-3 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <li className={`border rounded-xl p-4 ${theme.cardWithText} ${selection?.checked ? "ring-2 ring-red-500/60" : ""}`}>
      <div className="flex gap-4">
        {selection && (
          <input
            type="checkbox"
            checked={selection.checked}
            onChange={selection.onToggle}
            aria-label={`Select ${name} for deleting`}
            className="w-5 h-5 mt-1 shrink-0 accent-red-600 cursor-pointer"
          />
        )}
        <button
          type="button"
          onClick={onOpen}
          title="Open in Part Portal"
          className={`w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-lg overflow-hidden border flex items-center justify-center ${theme.imageBox}`}
        >
          {imageSrc ? <AuthenticatedImage src={imageSrc} alt={name} className="w-full h-full object-cover" /> : <span className={`text-[10px] ${theme.textMuted}`}>No image</span>}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <button type="button" onClick={onOpen} className="text-left text-lg font-semibold hover:text-blue-500 break-words">
                {name}
              </button>
              {part.catalogNumber && part.name && <div className={`text-sm font-mono ${theme.textMuted}`}>{part.catalogNumber}</div>}
            </div>
            <button
              type="button"
              onClick={onDelete}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-red-500/60 text-red-500 hover:bg-red-500/10 text-xs font-semibold"
            >
              Delete…
            </button>
          </div>

          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
            {fields
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="flex gap-2 min-w-0">
                  <dt className={`shrink-0 ${theme.textMuted}`}>{label}:</dt>
                  <dd className={`min-w-0 break-words ${theme.textValue}`}>{value}</dd>
                </div>
              ))}
          </dl>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={!part.onshapeURL} onClick={() => openExternal(part.onshapeURL)} className={fileButton}>
              Open Onshape
            </button>
            <button
              type="button"
              disabled={!part.stlLink}
              onClick={() => part.stlLink && downloadDriveFile(part.stlLink, `${part.name || "part"}.stl`)}
              className={fileButton}
              {...driveFileAttrs(part.stlLink, "STL")}
            >
              Download STL
            </button>
            <button
              type="button"
              disabled={!part.parasolidLink}
              onClick={() => part.parasolidLink && downloadDriveFile(part.parasolidLink, `${part.name || "part"}.x_t`)}
              className={fileButton}
              {...driveFileAttrs(part.parasolidLink, "Parasolid")}
            >
              Download Parasolid
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
