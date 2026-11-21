import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchFromApi } from "../../../util/ApiService";
import type { WorkOrderModel } from "../../../util/Models";
import type WorkOrderTableRow from "./WorkOrderTableRow";
import { applyCncGroups, combinedLinks, isCncCandidate, suggestCncGroups, toCncGroups, type CncGroup } from "./cncGroups";

/**
 * The work order's CNC jobs: parts cut in one run, sharing one Links cell
 * (cncGroups.ts). Keeps the groups, the parts picked for a merge, and saves
 * merges, removals and Links edits; `onError` shows a failed save.
 */
export function useCncGroups(workOrderID: string | undefined, rows: WorkOrderTableRow[], onError: (message: string) => void) {
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  const [cncGroups, setCncGroups] = useState<CncGroup[]>([]);
  // The groups for handlers that run later (timers, menus), kept current.
  const cncGroupsRef = useRef(cncGroups);
  useEffect(() => { cncGroupsRef.current = cncGroups; }, [cncGroups]);
  /** Part IDs picked with "Select for CNC merge" (right-click). */
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [groupSaving, setGroupSaving] = useState(false);
  /** Links edits of a merged cell waiting to be saved, per group. */
  const groupLinkTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Every CNC-group request is numbered, so a late reply can't undo a newer one:
  // the number of the newest reply shown, and of each group's newest Links save.
  const cncRequestSeqRef = useRef(0);
  const cncShownSeqRef = useRef(0);
  const linksRequestSeqRef = useRef<Map<string, number>>(new Map());

  /** The rows as the table shows them: groups together, sharing their links. */
  const displayRows = useMemo(() => applyCncGroups(rows, cncGroups), [rows, cncGroups]);

  /**
   * Creates (no groupID), changes or dissolves (partIDs []) a CNC group, or
   * with partIDs undefined changes only its links. The server answers with
   * every group of the work order, which replaces what's shown.
   */
  const saveCncGroup = useCallback(async (group: { groupID?: string; partIDs?: string[]; links?: string }) => {
      if (!workOrderID) return false;

      /**
       * Shows the server's groups unless a newer reply is already shown. A
       * group's Links still waiting to be saved, or saved by a newer request,
       * keep what was typed rather than flicker back to older text.
       */
      const showServerGroups = (serverGroups: { id: string; partIDs?: string[]; links?: string }[] | undefined, seq: number) => {
          if (seq < cncShownSeqRef.current) return;
          cncShownSeqRef.current = seq;
          setCncGroups((current) => {
              const localLinks = new Map(current.map((g) => [g.id, g.links]));
              return toCncGroups(serverGroups).map((g) => {
                  const typedLater = groupLinkTimersRef.current.has(g.id) || (linksRequestSeqRef.current.get(g.id) ?? 0) > seq;
                  return typedLater && localLinks.has(g.id) ? { ...g, links: localLinks.get(g.id)! } : g;
              });
          });
      };

      const seq = ++cncRequestSeqRef.current;
      if (group.groupID && group.links !== undefined) linksRequestSeqRef.current.set(group.groupID, seq);
      try {
          const result = await fetchFromApi<{ cncGroups: CncGroup[] }>(
              `/db/workOrder/id/${encodeURIComponent(workOrderID)}/cncGroup`,
              { method: "POST", body: JSON.stringify(group) }
          );
          showServerGroups(result?.cncGroups, seq);
          return true;
      } catch (err: any) {
          console.error("Failed to save the CNC group:", err);
          onErrorRef.current(`Couldn't save the CNC merge: ${err?.message || err}`);
          // Someone changed the groups meanwhile: show theirs instead of ours.
          if (err?.statusCode === 409) {
              const reloadSeq = ++cncRequestSeqRef.current;
              fetchFromApi<WorkOrderModel>(`/db/workOrder/id/${encodeURIComponent(workOrderID)}`)
                  .then((wo) => showServerGroups(wo?.cncGroups, reloadSeq))
                  .catch(() => undefined);
          }
          return false;
      }
  }, [workOrderID]);

  /** Merges these parts into one CNC job (joining the one group among them, if any). */
  const mergeParts = async (partIDs: string[]) => {
      const groups = cncGroupsRef.current;
      const touched = groups.filter((g) => g.partIDs.some((p) => partIDs.includes(p)));
      const base = touched.length === 1 ? touched[0] : undefined;
      // Only parts still in the BOM: one removed from it since stays listed in its job otherwise.
      const inBom = new Set(rows.map((r) => r.partID));
      const members = [...new Set([...(base?.partIDs ?? []), ...partIDs])].filter((p) => inBom.has(p));
      if (members.length < 2) return;
      // Links as shown: a part already in a job brings that job's links.
      const memberRows = displayRows.filter((r) => r.partID && members.includes(r.partID));
      setGroupSaving(true);
      const ok = await saveCncGroup(
          base
              ? { groupID: base.id, partIDs: members }
              : { partIDs: members, links: combinedLinks(memberRows) }
      );
      setGroupSaving(false);
      if (ok) setMergeSelection([]);
  };

  /** Takes one part out of its CNC job (its own links show again). */
  const removeFromGroup = async (row: WorkOrderTableRow) => {
      const group = cncGroupsRef.current.find((g) => row.partID && g.partIDs.includes(row.partID));
      if (!group) return;
      setGroupSaving(true);
      // Also drops parts no longer in the BOM (see mergeParts).
      const inBom = new Set(rows.map((r) => r.partID));
      await saveCncGroup({ groupID: group.id, partIDs: group.partIDs.filter((p) => p !== row.partID && inBom.has(p)) });
      setGroupSaving(false);
  };

  /** A merged Links cell was edited: shown at once, saved to the group shortly after. */
  const queueGroupLinks = (groupID: string, links: string) => {
      setCncGroups((groups) => groups.map((g) => (g.id === groupID ? { ...g, links } : g)));
      const timers = groupLinkTimersRef.current;
      const pending = timers.get(groupID);
      if (pending) clearTimeout(pending);
      timers.set(groupID, setTimeout(() => {
          timers.delete(groupID);
          void saveCncGroup({ groupID, links });
      }, 600));
  };

  const suggestions = useMemo(
      () => suggestCncGroups(rows, new Set(cncGroups.flatMap((g) => g.partIDs))),
      [rows, cncGroups]
  );
  /** CNC candidates without a saved size (published before sizes existed), so never suggested. */
  const unsizedCount = useMemo(() => rows.filter((r) => isCncCandidate(r) && !r.size).length, [rows]);

  return {
    cncGroups,
    /** Replaces the groups (the work order's, when it loads). */
    setCncGroups,
    displayRows,
    mergeSelection,
    setMergeSelection,
    groupSaving,
    mergeParts,
    removeFromGroup,
    queueGroupLinks,
    suggestions,
    unsizedCount,
  };
}
