/**
 * A thin progress bar: `done` of `total`, as a filled track. The track and
 * bar classes set its look (Tailwind by default; the Publish dialog passes
 * its own CSS classes).
 */
export default function ProgressBar({
  done,
  total,
  trackClassName = "mt-1.5 h-1 w-full rounded-full bg-zinc-800 overflow-hidden",
  barClassName = "h-full bg-blue-500 transition-all duration-200",
}: {
  done: number;
  total: number;
  trackClassName?: string;
  barClassName?: string;
}) {
  const percent = Math.min(100, Math.round((done / Math.max(total, 1)) * 100));
  return (
    <div className={trackClassName}>
      <div className={barClassName} style={{ width: `${percent}%` }} />
    </div>
  );
}
