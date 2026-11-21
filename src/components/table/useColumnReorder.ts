import { useMemo, useState } from "react";
import type { ColumnConfig } from "../Table";

/**
 * A Table's columns in the user's order, and moving them: by dragging a
 * header by its handle, or with moveColumn (the header menu). `onDragBegin`
 * runs when a drag starts (Table closes its header menu).
 */
export function useColumnReorder(columnsData: ColumnConfig[], onDragBegin: () => void) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);
  const [isHandleDragging, setIsHandleDragging] = useState<boolean>(false);

  // Only the user's column order is state; the columns themselves always come
  // from the current columnsData prop, so later changes to it (labels,
  // callbacks, added/removed columns) take effect. Pass a stable array
  // (module constant or useMemo): effects below depend on `columns`.
  const [columnOrder, setColumnOrder] = useState<string[]>(() => columnsData.map(c => c.key));
  const columns = useMemo(() => {
      const byKey = new Map(columnsData.map(c => [c.key, c] as const));
      // Removed columns drop out without leaving a gap.
      const order = columnOrder.filter(k => byKey.has(k));
      // A column not in the order yet (added after mount, e.g. shown by a
      // checkbox, or hidden while the user dragged columns) goes right after
      // the column it follows in columnsData, wherever the user moved that one.
      columnsData.forEach((c, i) => {
          if (order.includes(c.key)) return;
          let at = 0;
          for (let j = i - 1; j >= 0; j--) {
              const p = order.indexOf(columnsData[j].key);
              if (p >= 0) { at = p + 1; break; }
          }
          order.splice(at, 0, c.key);
      });
      return order.map(k => byKey.get(k)!);
  }, [columnsData, columnOrder]);

  const moveColumn = (fromIdx: number, toIdx: number) => {
      if (toIdx < 0 || toIdx >= columns.length) return;
      const updatedColumns = [...columns];
      const [movedItem] = updatedColumns.splice(fromIdx, 1);
      updatedColumns.splice(toIdx, 0, movedItem);
      setColumnOrder(updatedColumns.map(c => c.key));
  };


  const handleDragStart = (e: React.DragEvent, index: number) => {
      if (!isHandleDragging) { e.preventDefault(); return; }
      setDraggedIdx(index);
      const img = new Image();
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      e.dataTransfer.setDragImage(img, 0, 0);
      onDragBegin();
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedIdx === null) return;
      setDropTargetIdx(index);
  };

  const handleDrop = (targetIdx: number) => {
      if (draggedIdx === null || draggedIdx === targetIdx) { resetDragState(); return; }
      const originalFromIdx = columns.findIndex(c => c.key === columns[draggedIdx].key);
      const originalToIdx = columns.findIndex(c => c.key === columns[targetIdx].key);
      moveColumn(originalFromIdx, originalToIdx);
      resetDragState();
  };

  const resetDragState = () => { setDraggedIdx(null); setDropTargetIdx(null); setIsHandleDragging(false); };

  const getDropIndicatorClass = (index: number) => (draggedIdx !== null && dropTargetIdx !== null && index === dropTargetIdx && draggedIdx !== dropTargetIdx) ? 'drop-indicator-both' : '';

  return {
    columns,
    moveColumn,
    draggedIdx,
    isHandleDragging,
    setIsHandleDragging,
    handleDragStart,
    handleDragOver,
    handleDrop,
    resetDragState,
    getDropIndicatorClass,
  };
}
