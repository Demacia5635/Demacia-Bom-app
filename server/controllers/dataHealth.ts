/**
 * GET /db/health: every problem in the parts and BOMs, for the website's data
 * health page. Read-only; two queries (all BOMs, all parts), the rest in memory.
 *
 * The checks are the ones that stop a publish or a work order elsewhere, so
 * they reuse those rules instead of new ones:
 * - catalog numbers: src/util/catalogNumbers.ts (checkCatalogTree), the
 *   extension's and website's own rules, on each top-level assembly's tree as
 *   util/bomTree.ts catalogTree builds it (bought items exempt);
 * - clashes that block republishing: controllers/bomNameClash.ts;
 * - made parts' material and engineer: the extension's workOrderProblems.ts.
 * Severity, as the user defined it:
 * - "warning": data the team must fix before the item can go into a work
 *   order (numbers, duplicate numbers and names, an assembly saved from two
 *   workspaces, material, engineer, image, files, parts in no assembly);
 * - "error": data the code should have made impossible (a BOM pointing at a
 *   record that isn't saved).
 * Parts in no assembly are reported once (they should be deleted) and not
 * checked further.
 */
import type { NextFunction, Request, Response } from "express";
import Bom from "../models/Bom";
import Part from "../models/Part";
import { checkCatalogTree, type CatalogNode } from "../../src/util/catalogNumbers";
import { bomClashes } from "./bomNameClash";
import { topLevelBoms } from "../services/driveFolderPlan";

type Rec = Record<string, any>;

export const HEALTH_CODES = {
    CATALOG_NUMBER_INVALID: { title: "Catalog number breaks the numbering rules", severity: "warning" },
    CATALOG_NUMBER_DUPLICATE: { title: "Catalog number used by several assemblies", severity: "warning" },
    ASSEMBLY_NAME_DUPLICATE: { title: "Same-name assemblies without a catalog number", severity: "warning" },
    ASSEMBLY_IN_TWO_WORKSPACES: { title: "Assembly saved from several workspaces", severity: "warning" },
    PART_MISSING: { title: "Part missing from the database", severity: "error" },
    SUB_ASSEMBLY_MISSING: { title: "Sub-assembly missing from the database", severity: "error" },
    MISSING_MATERIAL: { title: "Missing material", severity: "warning" },
    MISSING_ENGINEER: { title: "Missing engineer", severity: "warning" },
    MISSING_IMAGE: { title: "Missing image", severity: "warning" },
    MISSING_STL: { title: "Missing STL file", severity: "warning" },
    MISSING_PARASOLID: { title: "Missing Parasolid file", severity: "warning" },
    NOT_IN_ANY_ASSEMBLY: { title: "Part not in any assembly", severity: "warning" },
} as const;
export type HealthCode = keyof typeof HEALTH_CODES;

interface HealthRecord {
    kind: "part" | "bom";
    id: string;
    name?: string;
    catalogNumber?: string;
    onshapeURL?: string;
    parents: { id: string; name?: string; catalogNumber?: string }[];
}
export interface HealthProblem {
    code: HealthCode;
    severity: "error" | "warning";
    message: string;
    records: HealthRecord[];
}

/** The engineer the extension puts on standard parts: not a real engineer. */
const STANDARD_PART_ENGINEER = "Standard Part";
const MAX_PARENTS = 10;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
/** Bought, not made (website: isPurchasedPart). */
const isPurchasedPart = (part: Rec) => !!part.isStandardContent || !!part.markedStandard || text(part.vendor) !== "";
/** Bought whole (website: isBoughtAssembly). */
const isBoughtAssembly = (bom: Rec) => !!bom.markedStandard || text(bom.vendor) !== "";
const hasImage = (record: Rec) => !!(text(record.avatarID) || text(record.driveFileId) || text(record.imageUrl) || text(record.thumbnailURL));
const shortID = (id: string) => id.slice(0, 6);

/** Every problem, from all the BOMs and parts. */
export function findProblems(boms: Rec[], parts: Rec[]): HealthProblem[] {
    const bomsByID = new Map(boms.map((bom) => [bom.id, bom]));
    const partsByID = new Map(parts.map((part) => [part.id, part]));

    // child ID -> the BOMs that list it directly (in BOM order of the DB).
    const parentsOf = new Map<string, Rec[]>();
    const addParent = (child: string, parent: Rec) => {
        const list = parentsOf.get(child) ?? [];
        if (!list.includes(parent)) list.push(parent);
        parentsOf.set(child, list);
    };
    for (const bom of boms) {
        for (const ref of bom.parts ?? []) if (ref?.partID) addParent(ref.partID, bom);
        for (const ref of bom.subAssemblies ?? []) if (ref?.bomID) addParent(ref.bomID, bom);
    }

    const recordOf = (kind: "part" | "bom", id: string): HealthRecord => {
        const record = kind === "part" ? partsByID.get(id) : bomsByID.get(id);
        const parents = (parentsOf.get(id) ?? []).slice(0, MAX_PARENTS)
            .map((p) => ({ id: p.id, name: p.name, catalogNumber: p.catalogNumber }));
        if (!record) return { kind, id, parents };
        return {
            kind,
            id,
            name: record.name,
            catalogNumber: record.catalogNumber,
            ...(text(record.onshapeURL) ? { onshapeURL: text(record.onshapeURL) } : {}),
            parents,
        };
    };
    const problems: HealthProblem[] = [];
    const add = (code: HealthCode, message: string, records: HealthRecord[]) =>
        problems.push({ code, severity: HEALTH_CODES[code].severity, message, records });

    // 1. Catalog numbers, by the shared rules, on each top-level assembly's tree.
    const seenProblems = new Set<string>();
    for (const top of topLevelBoms(boms)) {
        const seen = new Set<string>([top.id]);
        const node = (bom: Rec, isRoot: boolean): CatalogNode => {
            const children: CatalogNode[] = [];
            for (const ref of bom.subAssemblies ?? []) {
                const sub = bomsByID.get(ref?.bomID);
                if (!sub || seen.has(sub.id)) continue;
                seen.add(sub.id);
                children.push(node(sub, false));
            }
            for (const ref of bom.parts ?? []) {
                const part = partsByID.get(ref?.partID);
                if (!part) continue;
                children.push({ id: part.id, name: part.name || part.id, number: text(part.catalogNumber), isAssembly: false, exempt: isPurchasedPart(part), children: [] });
            }
            return { id: bom.id, name: bom.name || bom.id, number: text(bom.catalogNumber), isAssembly: true, exempt: !isRoot && isBoughtAssembly(bom), children };
        };
        for (const problem of checkCatalogTree(node(top, true))) {
            const key = `${problem.id}\n${problem.message}`;
            if (seenProblems.has(key)) continue;
            seenProblems.add(key);
            add("CATALOG_NUMBER_INVALID", problem.message, [recordOf(bomsByID.has(problem.id) ? "bom" : "part", problem.id)]);
        }
    }

    // 2. Clashes that block republishing (the same report as the Drive sort's dry run).
    const clashes = bomClashes(boms);
    for (const group of clashes.catalogNumbers) {
        add("CATALOG_NUMBER_DUPLICATE", `Catalog number ${group.catalogNumber} is used by ${group.boms.length} assemblies.`,
            group.boms.map((bom) => recordOf("bom", bom.id)));
    }
    for (const group of clashes.names) {
        add("ASSEMBLY_NAME_DUPLICATE",
            `${group.boms.length} assemblies in ${group.parent.name || group.parent.id} have no catalog number and the same name "${group.name}".`,
            group.boms.map((bom) => recordOf("bom", bom.id)));
    }
    for (const group of clashes.workspaces) {
        const sources = group.boms.map((bom) => `${bom.wvmType === "v" ? "version" : bom.wvmType === "m" ? "microversion" : "workspace"} ${shortID(bom.wvmID)}`);
        add("ASSEMBLY_IN_TWO_WORKSPACES", `Saved from ${new Set(sources).size} sources: ${[...new Set(sources)].join(", ")}.`,
            group.boms.map((bom) => recordOf("bom", bom.id)));
    }

    // 3. IDs a BOM lists that aren't saved.
    const missingParts = new Set<string>();
    const missingBoms = new Set<string>();
    for (const bom of boms) {
        for (const ref of bom.parts ?? []) if (ref?.partID && !partsByID.has(ref.partID)) missingParts.add(ref.partID);
        for (const ref of bom.subAssemblies ?? []) if (ref?.bomID && !bomsByID.has(ref.bomID)) missingBoms.add(ref.bomID);
    }
    for (const id of missingParts) add("PART_MISSING", "A BOM lists this part, but it isn't saved. Publish the BOM again.", [recordOf("part", id)]);
    for (const id of missingBoms) add("SUB_ASSEMBLY_MISSING", "A BOM lists this sub-assembly, but it isn't saved. Publish the BOM again.", [recordOf("bom", id)]);

    // 4. Parts no BOM lists: they shouldn't exist (the user's rule). Not checked further.
    for (const part of parts) {
        if (!parentsOf.has(part.id)) add("NOT_IN_ANY_ASSEMBLY", "Not in any assembly: should be deleted.", [recordOf("part", part.id)]);
    }

    // 5. Made parts (used in an assembly): what work orders and the files need.
    for (const part of parts) {
        if (!parentsOf.has(part.id) || isPurchasedPart(part)) continue;
        const record = () => [recordOf("part", part.id)];
        if (!text(part.material)) add("MISSING_MATERIAL", "Work orders need a material for made parts.", record());
        const engineer = text(part.engineer);
        if (!engineer || engineer === STANDARD_PART_ENGINEER) add("MISSING_ENGINEER", "Work orders need an engineer for made parts.", record());
        if (!hasImage(part)) add("MISSING_IMAGE", "No image. Publish the BOM again to export it.", record());
        if (part.wantStl && !text(part.stlLink)) add("MISSING_STL", "Set to export an STL file, but it has none. Publish the BOM again.", record());
        if (part.wantParasolid && !text(part.parasolidLink)) add("MISSING_PARASOLID", "Set to export a Parasolid file, but it has none. Publish the BOM again.", record());
    }
    // Made assemblies: an image.
    for (const bom of boms) {
        if (isBoughtAssembly(bom) || hasImage(bom)) continue;
        add("MISSING_IMAGE", "No image. Publish the BOM again to export it.", [recordOf("bom", bom.id)]);
    }

    const codeOrder = Object.keys(HEALTH_CODES);
    const sortName = (p: HealthProblem) => text(p.records[0]?.catalogNumber) || text(p.records[0]?.name) || p.records[0]?.id || "";
    return problems.sort((a, b) => codeOrder.indexOf(a.code) - codeOrder.indexOf(b.code) || sortName(a).localeCompare(sortName(b)));
}

export async function getDataHealth(req: Request, res: Response, next: NextFunction) {
    try {
        const [boms, parts] = await Promise.all([
            Bom.find({}, {
                id: 1, name: 1, catalogNumber: 1, onshapeID: 1, onshapeURL: 1, createdAt: 1, parts: 1, subAssemblies: 1,
                markedStandard: 1, vendor: 1, avatarID: 1, driveFileId: 1, imageUrl: 1, thumbnailURL: 1,
            }).lean<Rec[]>(),
            Part.find({}, {
                id: 1, name: 1, catalogNumber: 1, onshapeURL: 1, material: 1, engineer: 1, vendor: 1, isStandardContent: 1,
                markedStandard: 1, avatarID: 1, driveFileId: 1, imageUrl: 1, thumbnailURL: 1, stlLink: 1, parasolidLink: 1,
                wantStl: 1, wantParasolid: 1,
            }).lean<Rec[]>(),
        ]);
        const problems = findProblems(boms, parts);
        const byCode: Record<string, number> = {};
        for (const p of problems) byCode[p.code] = (byCode[p.code] ?? 0) + 1;
        return res.status(200).json({
            generatedAt: new Date().toISOString(),
            counts: { problems: problems.length, byCode },
            codeTitles: Object.fromEntries(Object.entries(HEALTH_CODES).map(([code, { title }]) => [code, title])),
            problems,
        });
    } catch (err) {
        return next(err);
    }
}
