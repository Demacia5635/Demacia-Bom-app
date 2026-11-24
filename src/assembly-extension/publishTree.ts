/**
 * Publish BOM, item by item: what is written for each kind of row (a part, a
 * sub-assembly, a sub-assembly marked standard), its edits written back to
 * Onshape, its files exported to Drive, and the files it replaced deleted.
 * AssemblyBomPage runs these in order (publishPlan.ts) and saves the top
 * assembly last.
 */
import { fetchFromApi } from "../util/ApiService";
import type AssemblyBomRow from "./AssemblyBomRow";
import {
  deleteDriveFile,
  syncBomThumbnailToDrive,
  syncPartFilesToDrive,
  updateOnshapeBomMetadata,
  updateOnshapePartMetadata,
  upsertBomById,
  upsertPartById,
  type OnshapeKey,
} from "./BomApi";
import { membersOf } from "./copyRows";
import { partFilesVersion, type ModelVersions } from "./modelVersions";
import { keyOf, keyString } from "./onshapeKeys";
import { isSavedSizeStale, needsSize, readPartSize } from "./partSize";
import { describePublishError } from "./publishErrors";
import type { linkArrays } from "./publishPlan";
import { changedFields, DATABASE_ONLY_FIELDS, hasNoRevision, isStandardRow, revisionLabel, stampOf, STANDARD_PART_ENGINEER } from "./rowRules";

/**
 * Items (parts / sub-assemblies) published at once. Each part exports its
 * thumbnail, STL and Parasolid together, so this is up to 3x as many Onshape
 * exports in flight. If Onshape rate-limits, those items are reported as
 * problems and retried by the next Publish BOM.
 */
export const PUBLISH_CONCURRENCY = 5;

/** New Drive file if one was made, else the saved one; remembers the replaced file. */
export function replaceFile(oldId: string | undefined, newId: string | null, toDelete: string[]): string {
  if (newId && oldId && oldId !== newId) toDelete.push(oldId);
  return newId || oldId || "";
}
/** Deletes replaced files once the record pointing at the new ones is saved. */
export async function deleteReplaced(ids: string[]): Promise<void> {
  for (const id of ids) {
    if (!(await deleteDriveFile(id))) console.warn(`[publish] could not delete replaced Drive file ${id}`);
  }
}

/**
 * Seconds left in a publish, from the average time per item so far; undefined
 * until 3 items are done (too early to guess).
 */
export function estimateSecondsLeft(startedAt: number, done: number, total: number, now = Date.now()): number | undefined {
  if (done < 3 || done >= total) return undefined;
  return Math.round((((now - startedAt) / done) * (total - done)) / 1000);
}

/** " - about 2 min left" for the progress line ("" when unknown). */
export function timeLeftSuffix(secondsLeft: number | undefined): string {
  if (secondsLeft === undefined) return "";
  if (secondsLeft < 60) return " - less than a minute left";
  return ` - about ${Math.round(secondsLeft / 60)} min left`;
}

/** What an item's progress line can say (AssemblyBomPage's publish progress). */
export interface PublishStep {
  step(next: string): void;
  /** The step it is on, for saying where a failure happened. */
  current(): string;
}

/** What publishing one item needs from the whole publish, and what it reports back. */
export interface PublishRowContext {
  /** Every row of the tree (a combined part's edits go to each of its uses). */
  rows: AssemblyBomRow[];
  versions: ModelVersions;
  /** The dialog's Default engineer (for items not in the database yet). */
  defaultEngineer: string;
  /** The Onshape page of a tab, on the panel's Onshape host. */
  onshapeUrlOf: (k: OnshapeKey) => string;
  /** An assembly's links to the items in it, by its row ID. */
  linksOf: (parentRowId: string) => ReturnType<typeof linkArrays>;
  /** Problems that don't stop the publish, reported at the end. */
  problems: string[];
  /** Rows whose edits couldn't be written to Onshape (they stay marked). */
  unsavedEdits: Set<string>;
  /** What changed per row, applied to the table at the end. */
  rowUpdates: Map<string, Partial<AssemblyBomRow>>;
}

/** 1. Cells changed from what was loaded from Onshape go to Onshape first. */
async function writeEditsToOnshape(row: AssemblyBomRow, key: OnshapeKey, progress: PublishStep, ctx: PublishRowContext): Promise<void> {
  const edited = changedFields(row, row.loaded);
  if (edited.length > 0 && row.vendor === "") {
    progress.step("Writing edits to Onshape");
    const values_ = row as unknown as Record<string, unknown>;
    try {
      if (row.isAssembly) {
        const data: Record<string, unknown> = {};
        if (edited.includes("name")) data.name = row.name;
        if (edited.includes("description")) data.description = row.description;
        if (edited.includes("catalogNumber")) data["part number"] = row.catalogNumber;
        if (Object.keys(data).length > 0) await updateOnshapeBomMetadata(key, data);
      } else {
        // Material (a library reference in Onshape) and the file choices are database-only.
        const data = Object.fromEntries(edited.filter((k) => !DATABASE_ONLY_FIELDS.has(k)).map((k) => [k, values_[k]]));
        // A combined part: every copy gets the edits, under every parent it's used in (copyRows.ts).
        if (Object.keys(data).length > 0) {
          const targets = new Map<string, { key: OnshapeKey; partID: string }>();
          for (const use of ctx.rows) {
            if (use.id !== row.id) continue;
            for (const m of membersOf(use)) {
              const copyKey = keyOf(m);
              targets.set(`${keyString(copyKey)}/${m.entityID}`, { key: copyKey, partID: m.entityID });
            }
          }
          for (const t of targets.values()) await updateOnshapePartMetadata(t.key, t.partID, data);
        }
      }
    } catch (err: any) {
      ctx.unsavedEdits.add(row.id);
      ctx.problems.push(`Writing the edits of "${row.name}" to Onshape failed: ${describePublishError(err)}`);
    }
  }
}

/** The engineer saved for an item. */
function engineerToSave(row: AssemblyBomRow, ctx: PublishRowContext): string {
  // ("Standard Part" left over from a standard mark that was removed counts as none.)
  // The default engineer is only for items not in the database yet; a saved
  // item keeps its engineer. An emptied Default engineer means none.
  const ownEngineer = row.engineer === STANDARD_PART_ENGINEER ? "" : row.engineer;
  return isStandardRow(row)
    ? STANDARD_PART_ENGINEER
    : row.vendor !== ""
      ? row.vendor
      : ownEngineer || (row.source === "db" ? "" : ctx.defaultEngineer);
}

/** A sub-assembly marked standard: its assembly record and a part record with the same id. */
async function publishStandardAssembly(
  row: AssemblyBomRow,
  key: OnshapeKey,
  engineer: string,
  toDelete: string[],
  progress: PublishStep,
  ctx: PublishRowContext
): Promise<void> {
  // A sub-assembly marked standard (a motor...): one bought item. Its
  // assembly record keeps the mark (so Refresh BOM doesn't load its
  // insides); a part record with the same id lists it in its parents'
  // parts, so the website and work orders show it as one purchased part.
  const unchanged = !!ctx.versions.tree && row.saved?.filesModelVersion === ctx.versions.tree && !!row.saved?.avatarID;
  let avatar: string | null = null;
  if (!unchanged) {
    progress.step("Saving thumbnail");
    avatar = await syncBomThumbnailToDrive(key, row.name);
    if (!avatar) ctx.problems.push(`Thumbnail of "${row.name}"`);
  }
  const avatarID = replaceFile(row.saved?.avatarID, avatar, toDelete);
  const filesModelVersion = !unchanged && !avatar ? "" : ctx.versions.tree ?? "";
  const savedBom = await upsertBomById(row.id, {
    id: row.id,
    name: row.name,
    description: row.description,
    catalogNumber: row.catalogNumber,
    comments: row.comments,
    engineer,
    onshapeURL: ctx.onshapeUrlOf(key),
    avatarID,
    filesModelVersion,
    onshapeID: { ...key, bomID: row.entityID },
    vendor: row.vendor,
    markedStandard: true,
  });
  progress.step("Saving as a standard part");
  await upsertPartById(row.id, {
    id: row.id,
    name: row.name,
    description: row.description,
    catalogNumber: row.catalogNumber,
    comments: row.comments,
    engineer,
    avatarID,
    stlLink: "",
    parasolidLink: "",
    onshapeURL: "",
    onshapeID: { ...key, partID: row.entityID },
    vendor: row.vendor,
    isStandardContent: true,
    markedStandard: true,
    wantStl: false,
    wantParasolid: false,
    filesModelVersion,
  });
  ctx.rowUpdates.set(row.id, {
    engineer,
    saved: { avatarID, filesModelVersion: filesModelVersion || undefined },
    dbUpdatedAt: stampOf(savedBom?.updatedAt),
  });
}

/** A sub-assembly: its record, with links to the items in it and a fresh picture when its tree changed. */
async function publishAssembly(
  row: AssemblyBomRow,
  key: OnshapeKey,
  engineer: string,
  toDelete: string[],
  progress: PublishStep,
  ctx: PublishRowContext
): Promise<void> {
  const links = ctx.linksOf(row.id);
  // The picture shows parts from across the tree: re-rendered when anything in it changed.
  const unchanged = !!ctx.versions.tree && row.saved?.filesModelVersion === ctx.versions.tree && !!row.saved?.avatarID;
  let avatar: string | null = null;
  if (!unchanged) {
    progress.step("Saving thumbnail");
    avatar = await syncBomThumbnailToDrive(key, row.name);
    if (!avatar) ctx.problems.push(`Thumbnail of "${row.name}"`);
  }
  const avatarID = replaceFile(row.saved?.avatarID, avatar, toDelete);
  const savedBom = await upsertBomById(row.id, {
    id: row.id,
    name: row.name,
    description: row.description,
    catalogNumber: row.catalogNumber,
    comments: row.comments,
    engineer,
    parts: links.parts,
    subAssemblies: links.subAssemblies,
    onshapeURL: ctx.onshapeUrlOf(key),
    avatarID,
    // A failed render leaves no version, so the next publish tries again.
    filesModelVersion: !unchanged && !avatar ? "" : ctx.versions.tree ?? "",
    onshapeID: {
      ...key,
      bomID: row.entityID,
    },
    vendor: row.vendor,
    markedStandard: false,
  });
  // Its standard mark was just removed: the part record it was listed
  // as isn't used any more (it shares its thumbnail, which stays).
  if (row.baseline?.markedStandard) {
    progress.step("Removing its standard-part record");
    await fetchFromApi(`/db/part/id/${encodeURIComponent(row.id)}`, { method: "DELETE" }).catch((err: any) => {
      if (err?.statusCode !== 404) ctx.problems.push(`Removing the standard-part record of "${row.name}": ${err?.message || err}`);
    });
  }
  ctx.rowUpdates.set(row.id, {
    saved: { avatarID, filesModelVersion: !unchanged && !avatar ? undefined : ctx.versions.tree ?? undefined },
    dbUpdatedAt: stampOf(savedBom?.updatedAt),
  });
}

/** A part: its files (exported when its model changed or newly ticked) and its record. */
async function publishPart(
  row: AssemblyBomRow,
  key: OnshapeKey,
  engineer: string,
  toDelete: string[],
  progress: PublishStep,
  ctx: PublishRowContext
): Promise<void> {
  // Standard Content (screws, nuts...) and parts marked standard are bought,
  // not made: no STL / Parasolid / Onshape link. Other parts keep the files
  // ticked in the STL / Parasolid columns.
  const standard = isStandardRow(row);
  const wantStl = !standard && !!row.wantStl;
  const wantParasolid = !standard && !!row.wantParasolid;

  // Files made from the same model version are kept; only changed models,
  // missing files and newly ticked ones are exported.
  const version = partFilesVersion(row, ctx.versions);
  const unchanged = !!version && row.saved?.filesModelVersion === version;
  const toExport = [
    ...(!(unchanged && row.saved?.avatarID) ? (["thumbnail"] as const) : []),
    ...(wantStl && !(unchanged && row.saved?.stlLink) ? (["stl"] as const) : []),
    ...(wantParasolid && !(unchanged && row.saved?.parasolidLink) ? (["parasolid"] as const) : []),
  ];
  let files = { avatarID: null as string | null, stlLink: null as string | null, parasolidLink: null as string | null };
  let exportFailed = false;
  if (toExport.length > 0) {
    progress.step(`Exporting ${toExport.map((k) => (k === "stl" ? "STL" : k === "parasolid" ? "Parasolid" : "thumbnail")).join(", ")}`);
    const result = await syncPartFilesToDrive(key, row.entityID, row.name, {
      configuration: row.configuration,
      only: [...toExport],
    });
    ctx.problems.push(...result.failures);
    exportFailed = result.failures.length > 0;
    files = result;
  }
  // Unticked (or Standard Content): the saved file is deleted.
  if (!wantStl && row.saved?.stlLink) toDelete.push(row.saved.stlLink);
  if (!wantParasolid && row.saved?.parasolidLink) toDelete.push(row.saved.parasolidLink);
  const saved = {
    avatarID: replaceFile(row.saved?.avatarID, files.avatarID, toDelete),
    stlLink: wantStl ? replaceFile(row.saved?.stlLink, files.stlLink, toDelete) : "",
    parasolidLink: wantParasolid ? replaceFile(row.saved?.parasolidLink, files.parasolidLink, toDelete) : "",
    // After a failed export the saved files may be stale: no version, so
    // the next publish exports again.
    filesModelVersion: exportFailed ? undefined : version ?? undefined,
  };
  // Size for the website. Sent only when known: a failed read never blanks a saved one.
  // Read from Onshape only when there's no size, or the saved one is from an older model.
  let size = standard || isSavedSizeStale(row, version) ? "" : row.size || "";
  if (!standard && !size && needsSize(row)) {
    progress.step("Reading its size");
    size = await readPartSize(row).catch(() => "");
  }
  progress.step("Saving to the database");
  const savedPart = await upsertPartById(row.id, {
    ...(size ? { size } : {}),
    id: row.id,
    name: row.name,
    description: row.description,
    catalogNumber: row.catalogNumber,
    material: row.material,
    mass: row.mass,
    price: row.price,
    comments: row.comments,
    engineer,
    avatarID: saved.avatarID,
    stlLink: saved.stlLink,
    parasolidLink: saved.parasolidLink,
    onshapeURL: standard ? "" : ctx.onshapeUrlOf(key),
    onshapeID: {
      ...key,
      partID: row.entityID,
    },
    vendor: row.vendor,
    // Work orders treat these as purchased (no catalog number needed).
    isStandardContent: standard,
    markedStandard: !!row.markedStandard,
    wantStl,
    wantParasolid,
    filesModelVersion: saved.filesModelVersion ?? "",
  });
  ctx.rowUpdates.set(row.id, {
    saved,
    dbUpdatedAt: stampOf(savedPart?.updatedAt),
    exportSTL: saved.stlLink,
    exportParasolid: saved.parasolidLink,
    ...(size ? { size, sizeVersion: undefined } : {}),
    ...(standard ? { onshapeURL: "", engineer } : {}),
    // The server's revision after this save (bumped if the part's data changed).
    revision: revisionLabel(savedPart, hasNoRevision(row)),
  });
}

/** Publishes one sub-assembly or part (edits to Onshape, files, record). */
export async function publishRow(row: AssemblyBomRow, progress: PublishStep, ctx: PublishRowContext): Promise<void> {
  const key = keyOf(row);
  await writeEditsToOnshape(row, key, progress, ctx);

  // 2. The full record, with fresh files.
  const engineer = engineerToSave(row, ctx);
  const toDelete: string[] = [];
  if (row.isAssembly && row.markedStandard) await publishStandardAssembly(row, key, engineer, toDelete, progress, ctx);
  else if (row.isAssembly) await publishAssembly(row, key, engineer, toDelete, progress, ctx);
  else await publishPart(row, key, engineer, toDelete, progress, ctx);

  // 3. The record now points at the new files; remove the ones it replaced.
  if (toDelete.length > 0) progress.step("Removing replaced files");
  await deleteReplaced(toDelete);
}
