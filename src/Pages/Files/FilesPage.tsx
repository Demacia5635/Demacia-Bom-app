/**
 * Drive overview (admin): counts and sizes of images / STL / Parasolid,
 * records missing a file, files no record uses (deletable to the Drive trash,
 * one or in bulk, like /orphans) and the largest files (server: GET
 * /api/admin/files, admin-only, cached 10 minutes).
 *
 * Route /files - in the sidebar's ADMIN section only.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import ErrorBanner from "../../components/ErrorBanner";
import { adminFetch } from "../../util/adminUnlock";
import { driveFileAttrs, driveViewUrl } from "../../util/driveLinks";
import DeleteDialog from "../../components/bulkDelete/DeleteDialog";
import { BulkDeleteBar, BulkDeleteButton } from "../../components/bulkDelete/BulkDeleteBar";
import { useBulkSelection } from "../../components/bulkDelete/useBulkSelection";
import { deleteFiles, fieldLabel, formatBytes, type FileRef, type FilesReply } from "./filesData";

function when(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
}

const recordPath = (kind: "part" | "bom", id: string) => (kind === "bom" ? `/bom/${encodeURIComponent(id)}` : `/partSearch?part=${encodeURIComponent(id)}`);

export default function FilesPage() {
  const theme = useThemeClasses();
  useDocumentTitle("Files");
  const [data, setData] = useState<FilesReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** 0: the server's cached listing; each Refresh lists Drive again. */
  const [refreshes, setRefreshes] = useState(0);
  const [filter, setFilter] = useState("");
  const [deleting, setDeleting] = useState<FileRef[] | null>(null);
  const bulk = useBulkSelection();

  useEffect(() => {
    let cancelled = false;
    adminFetch<FilesReply>(`/admin/files${refreshes > 0 ? "?refresh=1" : ""}`)
      .then((r) => {
        if (cancelled) return;
        setData(r);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err?.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [refreshes]);

  const matches = (f: FileRef, q: string) => {
    const query = q.trim().toLowerCase();
    return !query || [f.name, f.type, f.path].some((v) => v?.toLowerCase().includes(query));
  };
  const unused = useMemo(() => data?.unused ?? [], [data]);
  const shownUnused = useMemo(() => unused.filter((f) => matches(f, filter)), [unused, filter]);
  const selected = bulk.selectedOf(shownUnused, (f) => f.fileId);
  const unusedBytes = unused.reduce((n, f) => n + (f.bytes || 0), 0);

  // A file the filter hides is unselected, so nothing hidden is ever deleted.
  const changeFilter = (value: string) => {
    setFilter(value);
    bulk.keepOnly(unused.filter((f) => matches(f, value)).map((f) => f.fileId));
  };
  const handleDeleted = (ids: string[]) => {
    const gone = new Set(ids);
    setData((d) => (d ? { ...d, unused: d.unused.filter((f) => !gone.has(f.fileId)) } : d));
    bulk.keepOnly(unused.map((f) => f.fileId).filter((id) => !gone.has(id)));
  };

  const card = `border rounded-xl p-4 ${theme.card}`;
  const head = `text-xs font-semibold uppercase tracking-wide ${theme.textMuted}`;

  return (
    <div className={`min-h-screen p-4 sm:p-6 transition-colors duration-200 ${theme.page}`}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Files</h1>
            <p className={`text-xs ${theme.textMuted}`}>
              The team&apos;s Google Drive folders (Images, STL, Parasolid).{data ? ` Listed ${when(data.generatedAt)}; the server reuses a listing for 10 minutes.` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setRefreshes((n) => n + 1);
            }}
            disabled={loading}
            className="self-start sm:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold"
          >
            {loading ? "Listing Drive…" : "List Drive again"}
          </button>
        </div>

        {error && <ErrorBanner title="Couldn't list the files" className="p-3 rounded-lg text-sm">{error}</ErrorBanner>}
        {loading && !data && <p className={`text-sm ${theme.textMuted}`}>Listing Drive… (a large Drive can take a while)</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className={card}>
                <div className={head}>All files</div>
                <div className="text-2xl font-bold">{data.totals.files.toLocaleString()}</div>
                <div className={`text-xs ${theme.textMuted}`}>{formatBytes(data.totals.bytes)}</div>
              </div>
              {data.types.map((t) => (
                <details key={t.type} className={`${card} group`}>
                  <summary className="cursor-pointer list-none">
                    <div className={head}>{t.type}</div>
                    <div className="text-2xl font-bold">{t.files.toLocaleString()}</div>
                    <div className={`text-xs ${theme.textMuted}`}>{formatBytes(t.bytes)} · <span className="text-blue-500 group-open:hidden">by folder ▸</span></div>
                  </summary>
                  <ul className="mt-2 max-h-48 overflow-y-auto text-xs space-y-0.5">
                    {[...t.folders].sort((a, b) => b.bytes - a.bytes).map((f) => (
                      <li key={f.path} className="flex gap-2">
                        <span className="truncate font-mono">{f.path || "(top)"}</span>
                        <span className={`ml-auto shrink-0 ${theme.textMuted}`}>{f.files} · {formatBytes(f.bytes)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
              <div className={card}>
                <div className={head}>No record uses</div>
                <div className={`text-2xl font-bold ${unused.length ? "text-amber-500" : ""}`}>{unused.length}</div>
                <div className={`text-xs ${theme.textMuted}`}>{formatBytes(unusedBytes)}</div>
              </div>
            </div>

            <section className={`${card} space-y-2`}>
              <h2 className={head}>Missing files ({data.missing.length})</h2>
              {data.missing.length === 0 ? (
                <p className={`text-sm ${theme.textMuted}`}>Every part and BOM has the files it should.</p>
              ) : (
                <ul className="max-h-80 overflow-y-auto divide-y divide-zinc-500/20 text-sm">
                  {data.missing.map((m, i) => (
                    <li key={`${m.id}-${m.field}-${i}`} className="py-1.5 flex flex-wrap gap-x-3">
                      <Link to={recordPath(m.kind, m.id)} className="font-medium text-blue-500 hover:underline">{m.name || m.id}</Link>
                      <span className={`text-xs rounded px-1.5 py-0.5 bg-zinc-500/15`}>{fieldLabel(m.field)}</span>
                      <span className={m.reason === "no link" ? theme.textMuted : "text-red-500"}>{m.reason === "no link" ? "wanted, but never saved" : m.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${card} space-y-3`}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={`${head} mr-auto`}>Files no record uses ({unused.length})</h2>
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => changeFilter(e.target.value)}
                  placeholder="Filter by name, type, folder…"
                  className={`border rounded-lg px-3 py-1.5 text-sm w-full sm:w-56 ${theme.input}`}
                />
                {!bulk.selectMode && <BulkDeleteButton onClick={bulk.start} disabled={shownUnused.length === 0} />}
              </div>
              {bulk.selectMode && (
                <BulkDeleteBar
                  shownCount={shownUnused.length}
                  selectedCount={selected.length}
                  noun="files"
                  onDeleteAll={() => setDeleting(shownUnused)}
                  onDeleteSelected={() => setDeleting(selected)}
                  onCancel={bulk.cancel}
                />
              )}
              {shownUnused.length === 0 ? (
                <p className={`text-sm ${theme.textMuted}`}>{unused.length === 0 ? "Every file is used by a part or BOM." : "Nothing matches the filter."}</p>
              ) : (
                <ul className="divide-y divide-zinc-500/20 text-sm">
                  {shownUnused.map((f) => (
                    <li key={f.fileId} className={`py-2 flex flex-wrap items-center gap-x-3 gap-y-1 ${bulk.isSelected(f.fileId) ? "bg-red-500/5" : ""}`}>
                      {bulk.selectMode && (
                        <input
                          type="checkbox"
                          checked={bulk.isSelected(f.fileId)}
                          onChange={() => bulk.toggle(f.fileId)}
                          aria-label={`Select ${f.name} for deleting`}
                          className="w-4 h-4 accent-red-600 cursor-pointer"
                        />
                      )}
                      <a
                        href={driveViewUrl(f.fileId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-500 hover:underline break-all"
                        {...driveFileAttrs(f.fileId, f.type === "Images" ? "image" : f.type)}
                      >
                        {f.name}
                      </a>
                      <span className="text-xs rounded px-1.5 py-0.5 bg-zinc-500/15">{f.type}</span>
                      <span className={`text-xs font-mono ${theme.textMuted}`}>{f.path}</span>
                      <span className={`ml-auto text-xs tabular-nums ${theme.textMuted}`}>
                        {formatBytes(f.bytes)}
                        {f.modifiedTime ? ` · ${when(f.modifiedTime)}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeleting([f])}
                        className="px-2.5 py-1 rounded-lg border border-red-500/60 text-red-500 hover:bg-red-500/10 text-xs font-semibold"
                      >
                        Delete…
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${card} space-y-2`}>
              <h2 className={head}>Largest files</h2>
              <ol className="divide-y divide-zinc-500/20 text-sm">
                {data.largest.map((f) => (
                  <li key={f.fileId} className="py-1.5 flex flex-wrap items-baseline gap-x-3">
                    <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{formatBytes(f.bytes)}</span>
                    <a href={driveViewUrl(f.fileId)} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all" {...driveFileAttrs(f.fileId, f.type === "Images" ? "image" : f.type)}>
                      {f.name}
                    </a>
                    <span className="text-xs rounded px-1.5 py-0.5 bg-zinc-500/15">{f.type}</span>
                    {f.usedBy ? (
                      <Link to={recordPath(f.usedBy.kind, f.usedBy.id)} className={`text-xs hover:underline ${theme.textMuted}`}>
                        used by {f.usedBy.name || f.usedBy.id}
                      </Link>
                    ) : (
                      <span className="text-xs text-amber-500">unused</span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>

      {deleting && (
        <DeleteDialog
          items={deleting.map((f) => ({ id: f.fileId, name: f.name, detail: formatBytes(f.bytes) }))}
          noun={["file", "files"]}
          warning={`Moves ${deleting.length === 1 ? "this file" : `${deleting.length} files`} (${formatBytes(deleting.reduce((n, f) => n + (f.bytes || 0), 0))}) to the Drive trash, where it stays for 30 days.`}
          deletedText={() => "Moved to the Drive trash"}
          run={deleteFiles}
          onClose={() => setDeleting(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
