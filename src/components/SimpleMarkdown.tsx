import { Fragment, type ReactNode } from "react";

/** **bold**, `code` and [links](url) inside a line. */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const token = m[0];
    if (token.startsWith("**")) parts.push(<strong key={at}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) parts.push(<code key={at} className="px-1 rounded bg-zinc-500/15 text-[0.9em] font-mono">{token.slice(1, -1)}</code>);
    else {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/) ?? [];
      parts.push(/^https?:\/\//.test(href ?? "") ? <a key={at} href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{label}</a> : <Fragment key={at}>{label}</Fragment>);
    }
    last = at + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * The bit of Markdown the update logs use: #/##/### headings, "- " bullets
 * (indented ones nested), paragraphs, **bold**, `code` and links. Rendered as
 * elements, never as raw HTML. `skipTitle` leaves out a first "# " heading.
 */
export default function SimpleMarkdown({ text, skipTitle = false }: { text: string; skipTitle?: boolean }) {
  const blocks: ReactNode[] = [];
  let list: { depth: number; text: string }[] = [];
  let paragraph: string[] = [];
  const flushList = () => {
    if (list.length === 0) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={blocks.length} className="list-disc pl-5 space-y-1">
        {items.map((item, i) => (
          <li key={i} className={item.depth > 0 ? "ml-5 list-[circle]" : ""}>{inline(item.text)}</li>
        ))}
      </ul>
    );
  };
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(<p key={blocks.length}>{inline(paragraph.join(" "))}</p>);
    paragraph = [];
  };

  text.split(/\r?\n/).forEach((line, i) => {
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (heading) {
      flushList();
      flushParagraph();
      if (heading[1] === "#" && skipTitle && i === 0) return;
      const level = heading[1].length;
      const cls = level === 1 ? "text-xl font-bold" : level === 2 ? "text-base font-semibold mt-3" : "text-sm font-semibold mt-2";
      blocks.push(level === 1 ? <h2 key={blocks.length} className={cls}>{inline(heading[2])}</h2> : <h3 key={blocks.length} className={cls}>{inline(heading[2])}</h3>);
    } else if (bullet) {
      flushParagraph();
      list.push({ depth: bullet[1].length >= 2 ? 1 : 0, text: bullet[2] });
    } else if (line.trim() === "") {
      flushList();
      flushParagraph();
    } else if (list.length > 0 && /^\s+/.test(line)) {
      list[list.length - 1].text += " " + line.trim(); // a bullet's continued line
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  });
  flushList();
  flushParagraph();
  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>;
}
