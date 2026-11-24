/**
 * Activity feed (admin): publishes, revisions, deletes, work-order changes,
 * Drive sorts and cleanups, newest first, 100 at a time (server: GET
 * /api/admin/events, admin-only; about the last 5000 are kept). New events
 * appear every 30 seconds while the page is open.
 *
 * Route /activity - in the sidebar's ADMIN section only.
 */
import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardList, FilePlus2, FileX2, FolderSync, GitCompareArrows, Layers, ListChecks, Lock, Merge, Sparkles, Trash2, Upload, type LucideProps,
} from "lucide-react";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import ErrorBanner from "../../components/ErrorBanner";
import { adminFetch } from "../../util/adminUnlock";
import { KIND_LABELS, matchesEvent, mergeNewest, recordLink, timeAgo, type ActivityEvent, type EventsReply } from "./activityData";

const PAGE = 100;
const REFRESH_MS = 30_000;

const KIND_ICONS: Record<string, ComponentType<LucideProps>> = {
  "bom.publish": Upload,
  "part.create": FilePlus2,
  "part.revision": GitCompareArrows,
  "part.delete": FileX2,
  "workOrder.create": ClipboardList,
  "workOrder.save": ClipboardList,
  "workOrder.part": ListChecks,
  "workOrder.cncGroup": Merge,
  "drive.organize": FolderSync,
  "parts.cleanup": Sparkles,
  "drive.fileDelete": Trash2,
  "revisions.init": Layers,
  "admin.locked": Lock,
};

export default function ActivityPage() {
  const theme = useThemeClasses();
  useDocumentTitle("Activity");
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [who, setWho] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const url = useCallback((before?: string | null) => {
    const q = new URLSearchParams({ limit: String(PAGE) });
    if (before) q.set("before", before);
    if (kind) q.set("kind", kind);
    return `/admin/events?${q}`;
  }, [kind]);

  // The first page for the kind picked (a new kind starts over).
  useEffect(() => {
    let cancelled = false;
    adminFetch<EventsReply>(url())
      .then((r) => {
        if (cancelled) return;
        setEvents(r.events ?? []);
        setNext(r.next ?? null);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err?.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Every 30 s: the newest page, merged on top; "10 min ago" moves on too.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (document.hidden) return;
      adminFetch<EventsReply>(url())
        .then((r) => setEvents((shown) => mergeNewest(r.events ?? [], shown)))
        .catch(() => undefined); // the next tick tries again; the first load shows errors
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [url]);

  const loadMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    try {
      const r = await adminFetch<EventsReply>(url(next));
      setEvents((shown) => [...shown, ...(r.events ?? []).filter((e) => !shown.some((s) => s.id === e.id))]);
      setNext(r.next ?? null);
    } catch (err) {
      setError((err as Error)?.message || String(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const people = useMemo(() => [...new Set(events.map((e) => e.who).filter((w): w is string => !!w))].sort(), [events]);
  const shown = useMemo(() => events.filter((e) => matchesEvent(e, who, text)), [events, who, text]);
  const select = `border rounded-lg px-3 py-2 text-sm ${theme.input}`;

  return (
    <div className={`min-h-screen p-4 sm:p-6 transition-colors duration-200 ${theme.page}`}>
      <div className="max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
          <p className={`text-xs ${theme.textMuted}`}>
            Publishes, revisions, deletes, work-order changes, Drive sorts and cleanups. New ones appear every 30 seconds; about the last 5000 are kept.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={kind}
            onChange={(e) => {
              setLoading(true);
              setKind(e.target.value);
            }}
            className={select}
            aria-label="Kind"
          >
            <option value="">Everything</option>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <select value={who} onChange={(e) => setWho(e.target.value)} className={select} aria-label="Person">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Filter by assembly, part or text…"
            className={`${select} flex-1 min-w-[12rem]`}
          />
        </div>

        {error && <ErrorBanner title="Couldn't load the activity" className="p-3 rounded-lg text-sm">{error}</ErrorBanner>}
        {loading && events.length === 0 && <p className={`text-sm ${theme.textMuted}`}>Loading…</p>}
        {!loading && shown.length === 0 && (
          <p className={`text-sm ${theme.textMuted}`}>{events.length === 0 ? "Nothing recorded yet." : "Nothing matches the filters in what's loaded."}</p>
        )}

        <ul className={`border rounded-xl divide-y divide-zinc-500/20 ${theme.cardWithText} ${shown.length === 0 ? "hidden" : ""}`}>
          {shown.map((e) => {
            const Icon = KIND_ICONS[e.kind] ?? ClipboardList;
            // A deleted record has nothing left to open.
            const link = /delete$/i.test(e.kind) ? null : recordLink(e.record);
            return (
              <li key={e.id} className="flex gap-3 px-4 py-2.5">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${e.kind === "admin.locked" || e.kind.endsWith("elete") ? "text-red-500" : "text-blue-500"}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm break-words">
                    {link ? (
                      <Link to={link} className="hover:text-blue-500">{e.message}</Link>
                    ) : (
                      e.message
                    )}
                  </div>
                  <div className={`text-xs ${theme.textMuted}`}>
                    <span title={new Date(e.at).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem" })}>{timeAgo(e.at, now)}</span>
                    {" · "}
                    {KIND_LABELS[e.kind] ?? e.kind}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {next && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className={`px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-zinc-500/10 disabled:opacity-50 ${theme.border}`}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
