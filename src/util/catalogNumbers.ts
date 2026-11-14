/**
 * Catalog number rules (used by the BOM extension and by "Create work order").
 *
 * Numbers look like AABB-CDEF: AA = year (2027 -> 27), BB = project, and CDEF
 * places the item in the assembly tree:
 *  - Assemblies end in 0. Their level is how many of C, D, E are used:
 *    AABB-0000 = the whole project, C000 = a main assembly, CD00 inside C000,
 *    CDE0 inside CD00 (e.g. 2603-1110 in 2603-1100 in 2603-1000). A
 *    sub-assembly is exactly one level below its parent and starts with its
 *    parent's digits. The top assembly is AABB-0000 or AABB-C000.
 *  - Parts don't end in 0 and start with their assembly's digits (2603-11xx
 *    in 2603-1100), unless they belong to one of its sub-assemblies.
 *  - E may be skipped: a CDE0 assembly also owns the following CD(E+1)x,
 *    CD(E+2)x... numbers up to its next sibling assembly (with sub-assemblies
 *    1110 and 1130 in 1100, part 1122 belongs to 1110). D can't be skipped.
 *  - Everything made for this project uses the top's AABB. Items from an
 *    earlier year (smaller AA) are reused, so they're fine where they are.
 *  - A number is used by one item only.
 * Bought items (Standard Content, vendor parts, items marked standard) are skipped.
 */

export const CATALOG_NUMBER_FORMAT = /^\d{4}-\d{4}$/;

/** One item of the tree being checked. */
export interface CatalogNode {
  /** Record / row ID: the same item used in several places has the same id. */
  id: string;
  name: string;
  number: string;
  isAssembly: boolean;
  /** Bought (Standard Content, vendor, marked standard): not checked. */
  exempt: boolean;
  children: CatalogNode[];
}

export interface CatalogProblem {
  id: string;
  message: string;
}

interface Parsed {
  text: string;
  aa: number;
  aabb: string;
  /** C, D, E, F */
  digits: number[];
}

function parse(number: string): Parsed | null {
  const text = number.trim();
  if (!CATALOG_NUMBER_FORMAT.test(text)) return null;
  return { text, aa: Number(text.slice(0, 2)), aabb: text.slice(0, 4), digits: text.slice(5).split("").map(Number) };
}

/** Assembly level: how many of C, D, E are used (0 = AABB-0000). */
function levelOf(p: Parsed): number {
  for (let i = 2; i >= 0; i--) if (p.digits[i] !== 0) return i + 1;
  return 0;
}

const startsWith = (p: Parsed, digits: number[]) => digits.every((d, i) => p.digits[i] === d);

/** The numbers an assembly owns (before taking out its sub-assemblies'). */
interface Range {
  contains(p: Parsed): boolean;
  /** e.g. "2603-11xx" */
  describe: string;
}

function rangeOf(a: Parsed, level: number, siblingEs: number[]): Range {
  const head = a.digits.slice(0, level);
  if (level < 3) {
    return {
      contains: (p) => p.aabb === a.aabb && startsWith(p, head),
      describe: `${a.aabb}-${head.join("")}${"x".repeat(4 - level)}`,
    };
  }
  // CDE0: also the skipped E values up to the next sibling assembly.
  const e = a.digits[2];
  const nextE = Math.min(10, ...siblingEs.filter((s) => s > e));
  const cd = a.digits.slice(0, 2);
  const last = nextE - 1;
  return {
    contains: (p) => p.aabb === a.aabb && startsWith(p, cd) && p.digits[2] >= e && p.digits[2] <= last,
    describe:
      last === e
        ? `${a.aabb}-${cd.join("")}${e}x`
        : `${a.aabb}-${cd.join("")}${e}x to ${a.aabb}-${cd.join("")}${last}x`,
  };
}

/** Example number one level below `a` (for messages). */
function exampleBelow(a: Parsed, level: number): string {
  const digits = [...a.digits];
  digits[level] = 1;
  return `${a.aabb}-${digits.join("")}`;
}

/** Problems with the numbers in a tree (the root is the top assembly). */
export function checkCatalogTree(root: CatalogNode): CatalogProblem[] {
  const problems: CatalogProblem[] = [];
  const flagged = new Set<string>();
  const problem = (node: CatalogNode, message: string) => {
    const key = `${node.id}\n${message}`;
    if (flagged.has(key)) return;
    flagged.add(key);
    problems.push({ id: node.id, message });
  };

  const top = parse(root.number);
  if (!top) {
    problem(root, root.number.trim()
      ? `"${root.number}" isn't a catalog number like 2603-1000 (AABB-CDEF).`
      : "The top assembly needs a catalog number like 2603-1000 (AABB-C000) or 2603-0000.");
  } else if (top.digits[3] !== 0 || levelOf(top) > 1) {
    problem(root, `The top assembly should be AABB-0000 (whole project) or AABB-C000 (main assembly), e.g. ${top.aabb}-${top.digits[0] || 1}000; "${top.text}" isn't.`);
  }

  /**
   * Checks the children of assembly `node`. `self` is its parsed number and
   * `level` its level when the number is usable for placing children (else null).
   */
  const visit = (node: CatalogNode, self: Parsed | null, level: number | null, range: Range | null, project: Parsed | null) => {
    const label = self ? self.text : `"${node.name}"`;
    // Sub-assemblies that place numbers (valid, this project, right level).
    const subs: { node: CatalogNode; parsed: Parsed; level: number }[] = [];
    for (const child of node.children) {
      if (!child.isAssembly || child.exempt) continue;
      const p = parse(child.number);
      if (!p || !project || p.aabb !== project.aabb || p.digits[3] !== 0) continue;
      subs.push({ node: child, parsed: p, level: levelOf(p) });
    }
    const level3Es = subs.filter((s) => s.level === 3).map((s) => s.parsed.digits[2]);
    const subRanges = subs.map((s) => ({ ...s, range: rangeOf(s.parsed, s.level, level3Es) }));

    for (const child of node.children) {
      if (child.exempt) continue;
      const p = parse(child.number);
      if (!p) {
        problem(child, child.number.trim()
          ? `"${child.number}" isn't a catalog number like 2603-1101 (AABB-CDEF).`
          : "Needs a catalog number like 2603-1101 (AABB-CDEF).");
        if (child.isAssembly) visit(child, null, null, null, project);
        continue;
      }

      // From an earlier year: reused as it is. Its insides follow its own numbers.
      if (project && p.aa < project.aa) {
        if (child.isAssembly) visit(child, p, levelOf(p), rangeOf(p, levelOf(p), []), p);
        continue;
      }
      const wrongProject = !!project && p.aabb !== project.aabb;
      if (wrongProject) {
        problem(child, `Made for this project, so it should start with ${project!.aabb}- (not ${p.aabb}-), unless it's reused from an earlier year.`);
      }

      if (!child.isAssembly) {
        if (p.digits[3] === 0) {
          problem(child, `${p.text} ends in 0, which is for assemblies; part numbers end in 1-9.`);
        } else if (!wrongProject && range && level !== null) {
          const owner = subRanges.find((s) => s.range.contains(p));
          if (!range.contains(p)) {
            problem(child, `${p.text} doesn't belong in ${label}: its parts are numbered ${range.describe}.`);
          } else if (owner) {
            problem(child, `${p.text} is in the numbers of sub-assembly ${owner.parsed.text} (${owner.range.describe}), but it's used directly in ${label}.`);
          }
        }
        continue;
      }

      // A sub-assembly.
      const childLevel = levelOf(p);
      if (p.digits[3] !== 0) {
        problem(child, `${p.text} doesn't end in 0; assembly numbers end in 0 (e.g. ${p.aabb}-${p.digits.slice(0, 3).join("")}0).`);
      } else if (!wrongProject && self && level !== null && range) {
        if (level >= 3) {
          problem(child, `${label} is already the deepest assembly level (AABB-CDE0), so it can't hold the sub-assembly ${p.text}.`);
        } else if (childLevel !== level + 1) {
          problem(child, `${p.text} should be one level below ${label}, like ${exampleBelow(self, level)}.`);
        } else if (!range.contains(p)) {
          problem(child, `${p.text} doesn't belong in ${label}: its sub-assemblies are numbered ${range.describe}.`);
        }
      }
      const own = subRanges.find((s) => s.node === child);
      const usable = p.digits[3] === 0 && !wrongProject;
      visit(child, usable ? p : null, usable ? childLevel : null, own?.range ?? (usable ? rangeOf(p, childLevel, []) : null), project);
    }
  };

  const topUsable = top && top.digits[3] === 0 ? top : null;
  visit(
    root,
    topUsable,
    topUsable ? levelOf(topUsable) : null,
    topUsable ? rangeOf(topUsable, levelOf(topUsable), []) : null,
    top
  );

  // A number used by more than one item.
  const byNumber = new Map<string, Map<string, CatalogNode>>();
  const collect = (node: CatalogNode) => {
    const p = !node.exempt ? parse(node.number) : null;
    if (p) {
      const items = byNumber.get(p.text) ?? new Map<string, CatalogNode>();
      items.set(node.id, node);
      byNumber.set(p.text, items);
    }
    node.children.forEach(collect);
  };
  collect(root);
  for (const [number, items] of byNumber) {
    if (items.size < 2) continue;
    for (const node of items.values()) {
      const others = [...items.values()].filter((n) => n !== node).map((n) => `"${n.name}"`).join(", ");
      problem(node, `${number} is also used by ${others}; each item needs its own number.`);
    }
  }

  return problems;
}
