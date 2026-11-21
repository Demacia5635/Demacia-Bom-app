import { useThemeSync } from "../util/misc/useThemeSync";

/** One grey placeholder bar (pulsing while the real content loads). */
function Bar({ className = "" }: { className?: string }) {
  const { isLight } = useThemeSync();
  return <div className={`rounded ${isLight ? "bg-zinc-200" : "bg-zinc-800"} ${className}`} />;
}

/** What's loading, for screen readers (the bars themselves say nothing). */
function Loading({ label }: { label: string }) {
  return <span className="sr-only">{label}</span>;
}

/** A list of rows with a picture and two lines (the BOMs and Work Orders lists). */
export function SkeletonList({ label, rows = 6, className = "" }: { label: string; rows?: number; className?: string }) {
  const { isLight } = useThemeSync();
  return (
    <div role="status" className={`border rounded-xl overflow-hidden shadow-md animate-pulse ${isLight ? "bg-white border-zinc-200" : "bg-zinc-900 border-zinc-800"} ${className}`}>
      <Loading label={label} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`flex items-center gap-4 px-4 py-3 border-b last:border-b-0 ${isLight ? "border-zinc-200" : "border-zinc-800"}`}>
          <Bar className="w-12 h-12 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Bar className="h-3.5 w-1/3" />
            <Bar className="h-3 w-1/5" />
          </div>
          <Bar className="h-3 w-24 hidden sm:block" />
        </div>
      ))}
    </div>
  );
}

/** A grid of cards with a picture and three lines (the parts lists). */
export function SkeletonCards({ label, count = 9 }: { label: string; count?: number }) {
  const { isLight } = useThemeSync();
  return (
    <div role="status" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      <Loading label={label} />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`border rounded-xl p-4 shadow-md flex gap-4 ${isLight ? "bg-white border-zinc-200" : "bg-zinc-900 border-zinc-800"}`}>
          <Bar className="w-16 h-16 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <Bar className="h-3.5 w-2/3" />
            <Bar className="h-3 w-1/2" />
            <Bar className="h-3 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A table with a header and rows of cells (the BOM and work-order tables). */
export function SkeletonTable({ label, rows = 8, columns = 7 }: { label: string; rows?: number; columns?: number }) {
  const { isLight } = useThemeSync();
  const border = isLight ? "border-zinc-200" : "border-zinc-800";
  return (
    <div role="status" className={`border rounded-xl overflow-hidden animate-pulse ${isLight ? "bg-white" : "bg-zinc-900"} ${border}`}>
      <Loading label={label} />
      <div className={`flex gap-4 px-4 py-3 border-b ${border} ${isLight ? "bg-zinc-100" : "bg-zinc-950"}`}>
        {Array.from({ length: columns }, (_, c) => <Bar key={c} className="h-3 flex-1" />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={`flex items-center gap-4 px-4 py-3 border-b last:border-b-0 ${border}`}>
          <Bar className="w-8 h-8 rounded shrink-0" />
          {Array.from({ length: columns - 1 }, (_, c) => <Bar key={c} className="h-3 flex-1" />)}
        </div>
      ))}
    </div>
  );
}
