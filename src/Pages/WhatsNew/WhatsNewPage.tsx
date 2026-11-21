import SimpleMarkdown from "../../components/SimpleMarkdown";
import { useThemeClasses } from "../../util/misc/useThemeClasses";

// Every website version's update log, bundled into this page when the site is built.
const LOGS = import.meta.glob("../../upd. logs/v*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** "v2.0.1.md" → [2, 0, 1]. */
const versionOf = (path: string): number[] =>
  (path.match(/v(\d+)\.(\d+)\.(\d+)\.md$/) ?? []).slice(1).map(Number);

const VERSIONS = Object.entries(LOGS)
  .map(([path, text]) => ({ version: versionOf(path), text }))
  .filter((v) => v.version.length === 3)
  .sort((a, b) => b.version[0] - a.version[0] || b.version[1] - a.version[1] || b.version[2] - a.version[2]);

/**
 * "What's new" (QW21, from the top bar's version): every website version's
 * update log, newest first. The latest three are open; older ones fold.
 */
export default function WhatsNewPage() {
  const theme = useThemeClasses();
  return (
    <div className={`min-h-screen p-6 transition-colors duration-200 ${theme.page}`}>
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className={`text-2xl font-bold tracking-tight ${theme.textHeading}`}>What&apos;s new</h1>
        <p className={`text-sm ${theme.textMuted}`}>What each version of the website changed, newest first.</p>
        {VERSIONS.map(({ version, text }, i) => (
          <details key={version.join(".")} open={i < 3} className={`rounded-xl border px-5 py-4 shadow-sm ${theme.cardWithText}`}>
            <summary className={`cursor-pointer font-semibold ${theme.textHeading}`}>
              Version {version.join(".")}
              {i === 0 && <span className="ml-2 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-500">Latest</span>}
            </summary>
            <div className="mt-3">
              <SimpleMarkdown text={text} skipTitle />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
