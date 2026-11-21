import { useThemeClasses } from "../util/misc/useThemeClasses";

/** Numbers in a header card's middle: big value, small label (e.g. "24 parts", "130 pieces"). */
export default function HeaderTotals({ items }: { items: { value: string | number; label: string; title?: string }[] }) {
  const theme = useThemeClasses();
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      {items.map((item) => (
        <div key={item.label} title={item.title} className="text-center">
          <dt className="sr-only">{item.label}</dt>
          <dd>
            <span className={`block text-xl font-bold tabular-nums ${theme.textHeading}`}>{item.value}</span>
            <span className={`block text-xs ${theme.textMuted}`} aria-hidden="true">{item.label}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
