/** `text` with the parts matching `pattern` (util/search.ts) marked. */
export default function Highlight({ text, pattern }: { text: string; pattern: RegExp | null }) {
  if (!pattern || !text) return <>{text}</>;
  const global = new RegExp(pattern.source, "gi");
  const parts: (string | { match: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(global)) {
    if (m.index === undefined || m[0] === "") continue;
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ match: m[0] });
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return <>{text}</>;
  if (last < text.length) parts.push(text.slice(last));
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          p
        ) : (
          <mark key={i} className="bg-yellow-300/70 text-inherit rounded-sm px-0.5">
            {p.match}
          </mark>
        )
      )}
    </>
  );
}
