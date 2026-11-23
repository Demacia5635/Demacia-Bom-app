/**
 * The data-health reply (server: GET /db/health) grouped for the page: one
 * section per problem code, errors first.
 */

export interface HealthRecordRef {
  id: string;
  name?: string;
  catalogNumber?: string;
}

export interface HealthRecord extends HealthRecordRef {
  kind: "part" | "bom";
  onshapeURL?: string;
  /** The BOMs that list it directly (at most 10). */
  parents?: HealthRecordRef[];
}

export interface HealthProblem {
  code: string;
  severity: "error" | "warning" | string;
  message: string;
  records: HealthRecord[];
}

export interface HealthReply {
  generatedAt: string;
  counts?: { problems: number; byCode: Record<string, number> };
  codeTitles?: Record<string, string>;
  problems: HealthProblem[];
}

export interface HealthSection {
  code: string;
  title: string;
  severity: string;
  problems: HealthProblem[];
  /** All problems in the section have this message: shown once, not on each row. */
  sharedMessage: string | null;
}

/** "MISSING_MATERIAL" → "Missing material", for a code without a title. */
export function titleFromCode(code: string): string {
  const words = code.toLowerCase().split("_").filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function matches(problem: HealthProblem, query: string): boolean {
  const texts = [problem.message];
  for (const r of problem.records ?? []) {
    texts.push(r.id, r.name ?? "", r.catalogNumber ?? "");
    for (const p of r.parents ?? []) texts.push(p.name ?? "", p.catalogNumber ?? "");
  }
  return texts.some((t) => t.toLowerCase().includes(query));
}

/**
 * Sections by code (in the server's order), errors before warnings; only
 * problems matching `filter` (message, record or parent name / catalog #).
 */
export function healthSections(reply: HealthReply, filter = ""): HealthSection[] {
  const query = filter.trim().toLowerCase();
  const byCode = new Map<string, HealthProblem[]>();
  const allMessages = new Map<string, Set<string>>();
  for (const problem of reply.problems ?? []) {
    if (!allMessages.has(problem.code)) allMessages.set(problem.code, new Set());
    allMessages.get(problem.code)!.add(problem.message);
    if (query && !matches(problem, query)) continue;
    if (!byCode.has(problem.code)) byCode.set(problem.code, []);
    byCode.get(problem.code)!.push(problem);
  }
  const sections = [...byCode].map(([code, problems]): HealthSection => {
    const messages = allMessages.get(code)!;
    return {
      code,
      title: reply.codeTitles?.[code] || titleFromCode(code),
      severity: problems.some((p) => p.severity === "error") ? "error" : problems[0].severity,
      problems,
      sharedMessage: messages.size === 1 && problems.length > 1 ? [...messages][0] : null,
    };
  });
  const rank = (s: HealthSection) => (s.severity === "error" ? 0 : 1);
  return sections.sort((a, b) => rank(a) - rank(b)); // stable: keeps the server's order within each
}
