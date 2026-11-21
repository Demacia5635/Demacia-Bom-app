/**
 * Undo / redo of the table's edits (cells, standard marks, combines, reverts,
 * suggested fixes) until the next load or publish. Each step is the whole
 * tree as it was before the edit; going back keeps rows expanded or collapsed
 * as they are now (expanding isn't an edit).
 */
import { useCallback, useRef, useState } from "react";
import type AssemblyBomRow from "./AssemblyBomRow";

const MAX_STEPS = 50;

export interface EditHistory {
  /** Saves `nextRows` as an edit that can be undone (`before` = the rows until now). */
  record: (before: AssemblyBomRow[]) => void;
  undo: () => void;
  redo: () => void;
  /** Forget every step (after a load or a publish). */
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useEditHistory(
  /** The rows on screen now. */
  currentRows: () => AssemblyBomRow[],
  /** Shows rows and keeps the saved copy in step (AssemblyBomPage's saveRows). */
  show: (rows: AssemblyBomRow[]) => void
): EditHistory {
  const undoSteps = useRef<AssemblyBomRow[][]>([]);
  const redoSteps = useRef<AssemblyBomRow[][]>([]);
  const [sizes, setSizes] = useState({ undo: 0, redo: 0 });
  const sync = () => setSizes({ undo: undoSteps.current.length, redo: redoSteps.current.length });

  /** A step's rows, with today's expanded / collapsed rows. */
  const restore = useCallback(
    (step: AssemblyBomRow[]) => {
      const expanded = new Map(currentRows().map((r) => [r.id, r.isExpanded]));
      show(step.map((r) => {
        const now = expanded.get(r.id);
        return now === undefined || now === r.isExpanded ? r : { ...r, isExpanded: now };
      }));
    },
    [currentRows, show]
  );

  const record = useCallback((before: AssemblyBomRow[]) => {
    undoSteps.current.push(before);
    if (undoSteps.current.length > MAX_STEPS) undoSteps.current.shift();
    redoSteps.current = [];
    sync();
  }, []);

  const undo = useCallback(() => {
    const step = undoSteps.current.pop();
    if (!step) return;
    redoSteps.current.push(currentRows());
    sync();
    restore(step);
  }, [currentRows, restore]);

  const redo = useCallback(() => {
    const step = redoSteps.current.pop();
    if (!step) return;
    undoSteps.current.push(currentRows());
    sync();
    restore(step);
  }, [currentRows, restore]);

  const clear = useCallback(() => {
    undoSteps.current = [];
    redoSteps.current = [];
    sync();
  }, []);

  return { record, undo, redo, clear, canUndo: sizes.undo > 0, canRedo: sizes.redo > 0 };
}
