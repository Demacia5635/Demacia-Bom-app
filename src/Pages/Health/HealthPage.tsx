/**
 * Data health: every problem the server finds in the saved parts and BOMs
 * (server: GET /db/health), one collapsible section per kind, errors first,
 * each item linked to its part (Part Portal) or BOM.
 *
 * Route /health - deliberately not linked from the sidebar or anywhere else.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFromApi, type ApiError } from "../../util/ApiService";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import ErrorBanner, { ApiErrorText } from "../../components/ErrorBanner";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { openExternal } from "../../util/openExternal";
import { healthSections, type HealthProblem, type HealthRecord, type HealthRecordRef, type HealthReply, type HealthSection } from "./healthGroups";

/** Extra text under a section's title, by code. */
const SECTION_NOTES: Record<string, string> = {
  NOT_IN_ANY_ASSEMBLY: "These parts aren't in any assembly. Talk to Eyal for further questions.",
};

const sectionId = (code: string) => `health-${code}`;

function severityClasses(severity: string): string {
  return severity === "error" ? "bg-red-500/15 text-red-500 border-red-500/40" : "bg-amber-500/15 text-amber-500 border-amber-500/40";
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
}

export default function HealthPage() {
  const theme = useThemeClasses();
  useDocumentTitle("Data health");
  const [reply, setReply] = useState<HealthReply | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);
  const [filter, setFilter] = useState("");
  /** Sections opened or closed by hand (code → open); the rest follow the default. */
  const [openState, setOpenState] = useState<Record<string, boolean>>({});

  // Loads on open and on each Refresh (which sets `loading` first).
  useEffect(() => {
    let cancelled = false;
    fetchFromApi<HealthReply>("/db/health")
      .then((r) => { if (!cancelled) setReply(r); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  const allSections = useMemo(() => (reply ? healthSections(reply) : []), [reply]);
  const sections = useMemo(() => (reply ? healthSections(reply, filter) : []), [reply, filter]);
  const filtering = filter.trim() !== "";
  // Errors start open; while filtering, every section with matches is open.
  const isOpen = (s: HealthSection) => openState[s.code] ?? (filtering || s.severity === "error");

  const jumpTo = (code: string) => {
    setOpenState((o) => ({ ...o, [code]: true }));
    requestAnimationFrame(() => document.getElementById(sectionId(code))?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const total = reply?.problems?.length ?? 0;
  return (
    <div className={`min-h-screen p-4 sm:p-6 transition-colors duration-200 ${theme.page}`}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Data health</h1>
            <p className={`text-xs ${theme.textMuted}`}>
              Problems in the saved parts and BOMs. Errors are data the app should never have saved; warnings are data the team should fix.
              {reply?.generatedAt ? ` Last checked ${formatTime(reply.generatedAt)}.` : ""}
            </p>
          </div>
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name, catalog #, BOM…"
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
              {loading ? "Checking..." : "Refresh"}
            </button>
          </div>
        </div>

        {error != null && (
          <ErrorBanner title="Couldn't check the data" className="p-4 rounded-lg">
            <ApiErrorText error={error as ApiError} />
          </ErrorBanner>
        )}

        {loading && !reply && <p className={`text-sm ${theme.textMuted}`}>Checking the database…</p>}

        {reply && total === 0 && <p className="text-sm text-green-500">No problems found.</p>}

        {allSections.length > 0 && (
          <nav aria-label="Problem types" className="flex flex-wrap gap-2">
            {allSections.map((s) => {
              const shown = sections.find((x) => x.code === s.code)?.problems.length ?? 0;
              return (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => jumpTo(s.code)}
                  disabled={shown === 0}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-40 ${severityClasses(s.severity)}`}
                >
                  {s.title}
                  <span className="tabular-nums">{filtering ? `${shown}/${s.problems.length}` : s.problems.length}</span>
                </button>
              );
            })}
          </nav>
        )}

        {reply && total > 0 && sections.length === 0 && <p className={`text-sm ${theme.textMuted}`}>Nothing matches the filter.</p>}

        <div className="space-y-3">
          {sections.map((s) => (
            <section key={s.code} id={sectionId(s.code)} className={`border rounded-xl scroll-mt-4 ${theme.cardWithText}`}>
              <button
                type="button"
                aria-expanded={isOpen(s)}
                onClick={() => setOpenState((o) => ({ ...o, [s.code]: !isOpen(s) }))}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <span aria-hidden="true" className={`w-3 text-base leading-none ${theme.textMuted}`}>{isOpen(s) ? "▾" : "▸"}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${severityClasses(s.severity)}`}>{s.severity}</span>
                <span className="font-semibold">{s.title}</span>
                <span className={`text-sm tabular-nums ${theme.textMuted}`}>({s.problems.length})</span>
              </button>
              {isOpen(s) && (
                <div className={`border-t px-4 pb-3 ${theme.border}`}>
                  {(SECTION_NOTES[s.code] || s.sharedMessage) && (
                    <p className={`pt-3 text-sm ${theme.textLabel}`}>
                      {SECTION_NOTES[s.code] || s.sharedMessage}
                    </p>
                  )}
                  <ul className="divide-y divide-zinc-500/20">
                    {s.problems.map((p, i) => (
                      <ProblemRow key={`${p.records?.[0]?.id ?? ""}-${i}`} problem={p} showMessage={!s.sharedMessage} />
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProblemRow({ problem, showMessage }: { problem: HealthProblem; showMessage: boolean }) {
  const theme = useThemeClasses();
  // The BOMs using any of its records, once each.
  const parents = [...new Map((problem.records ?? []).flatMap((r) => r.parents ?? []).map((p) => [p.id, p])).values()];
  return (
    <li className="py-2.5 text-sm space-y-1">
      {showMessage && <div className={theme.textValue}>{problem.message}</div>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {(problem.records ?? []).map((r) => (
          <RecordLink key={`${r.kind}-${r.id}`} record={r} />
        ))}
      </div>
      {parents.length > 0 && (
        <div className={`text-xs ${theme.textMuted}`}>
          in:{" "}
          {parents.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <Link to={`/bom/${encodeURIComponent(p.id)}`} className="text-blue-500 hover:underline">
                {refLabel(p)}
              </Link>
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function refLabel(r: HealthRecordRef): string {
  return r.name ? (r.catalogNumber ? `${r.name} (${r.catalogNumber})` : r.name) : r.catalogNumber || r.id;
}

function RecordLink({ record }: { record: HealthRecord }) {
  const theme = useThemeClasses();
  const saved = !!(record.name || record.catalogNumber || record.onshapeURL);
  if (!saved) {
    return (
      <span className={theme.textMuted}>
        {record.kind === "bom" ? "Sub-assembly" : "Part"} <span className="font-mono">{record.id}</span> (not saved)
      </span>
    );
  }
  const to = record.kind === "bom" ? `/bom/${encodeURIComponent(record.id)}` : `/partSearch?part=${encodeURIComponent(record.id)}`;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Link to={to} className="font-semibold text-blue-500 hover:underline break-words">
        {record.name || record.catalogNumber}
      </Link>
      {record.name && record.catalogNumber && <span className={`font-mono text-xs ${theme.textMuted}`}>{record.catalogNumber}</span>}
      {record.onshapeURL && (
        <button type="button" onClick={() => openExternal(record.onshapeURL)} className={`text-xs hover:underline ${theme.textMuted}`}>
          Onshape ↗
        </button>
      )}
    </span>
  );
}
