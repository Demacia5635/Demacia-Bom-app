import { useEffect, useState, type RefObject } from "react";
import type { ColumnConfig } from "../Table";

/**
 * A Table's column widths: set by dragging a header's edge (handleResizeStart,
 * with auto-scroll near the edges) or by the caller (setColumnWidths, e.g. a
 * double-click fit). Until the user sizes it, the last column fills the space
 * left in the wrapper (autoLastColWidth).
 */
export function useColumnResize(
  columns: ColumnConfig[],
  wrapperRef: RefObject<HTMLDivElement | null>,
  defaultColWidth: number,
  minLastColWidth: number,
  /** Remembered widths (QW7). */
  initialWidths: Record<string, number> = {}
) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(initialWidths);
  const [autoLastColWidth, setAutoLastColWidth] = useState<number | null>(null);

  useEffect(() => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      // No columns: no last column to fit (its width is never asked for).
      const lastCol = columns[columns.length - 1];
      if (!lastCol) return;

      const recompute = () => {
          if (Object.prototype.hasOwnProperty.call(columnWidths, lastCol.key)) {
              setAutoLastColWidth(null);
              return;
          }

          const othersWidth = columns
              .slice(0, -1)
              .reduce((sum, c) => sum + (columnWidths[c.key] || c.width || defaultColWidth), 0);

          const available = wrapper.clientWidth - othersWidth;
          setAutoLastColWidth(Math.max(minLastColWidth, available));
      };

      recompute();

      const ro = new ResizeObserver(recompute);
      ro.observe(wrapper);
      return () => ro.disconnect();
  }, [columns, columnWidths, defaultColWidth, minLastColWidth, wrapperRef]);

  const handleResizeStart = (e: React.PointerEvent, key: string) => {
      e.stopPropagation();
      e.preventDefault();

      const th = (e.target as HTMLElement).closest('th');
      if (!th) return;

      const table = th.closest('table');
      const colIndex = Array.from(th.parentNode?.children || []).indexOf(th);
      const colElement = table?.querySelector('colgroup')?.children[colIndex] as HTMLElement;

      const initialWidth = colElement ? colElement.getBoundingClientRect().width : th.getBoundingClientRect().width;
      const startX = e.clientX;
      const wrapper = th.closest('.table-wrapper') as HTMLElement;

      let currentWidth = initialWidth;
      let latestClientX = startX;
      let isActive = true;
      let rafId: number | null = null;

      const EDGE_ZONE = 40;
      const MAX_EDGE_SPEED = 40;

      const targetElement = e.target as HTMLElement;
      targetElement.setPointerCapture(e.pointerId);

      const applyWidth = (w: number) => {
          currentWidth = Math.max(60, w);
          if (colElement) colElement.style.width = `${currentWidth}px`;
          if (table) table.style.width = 'max-content';
      };

      const tick = () => {
          if (!isActive) return;

          const rawDelta = latestClientX - startX;
          const absDelta = Math.abs(rawDelta);
          const isShrinking = rawDelta < 0;

          const speedMultiplier = 1 + (absDelta * 0.015);
          const scaledDelta = rawDelta * speedMultiplier;

          applyWidth(initialWidth + scaledDelta);

          const distanceIntoRightEdge = latestClientX - (window.innerWidth - EDGE_ZONE);
          if (distanceIntoRightEdge > 0) {
              const growth = Math.min(MAX_EDGE_SPEED, (distanceIntoRightEdge / EDGE_ZONE) * MAX_EDGE_SPEED);
              applyWidth(currentWidth + growth);
              if (wrapper) wrapper.scrollLeft += growth * 1.5;
          } else if (latestClientX <= EDGE_ZONE) {
              const distanceIntoLeftEdge = EDGE_ZONE - latestClientX;
              const shrink = Math.min(MAX_EDGE_SPEED, (distanceIntoLeftEdge / EDGE_ZONE) * MAX_EDGE_SPEED);
              applyWidth(currentWidth - shrink);
          }

          if (wrapper && !isShrinking) {
              const wrapperRect = wrapper.getBoundingClientRect();
              if (latestClientX > wrapperRect.right - 100) {
                  const scrollPush = Math.max(5, (latestClientX - (wrapperRect.right - 100)) * 0.8);
                  wrapper.scrollLeft += scrollPush;
              }
          }

          rafId = requestAnimationFrame(tick);
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
          latestClientX = moveEvent.clientX;
      };

      // Ends the resize once, however the pointer is let go: released, cancelled
      // (touch scroll, alt-tab, the element removed) or its capture lost.
      // Otherwise the column would keep following the pointer.
      const END_EVENTS = ['pointerup', 'pointercancel', 'lostpointercapture'] as const;
      const endResize = (endEvent: PointerEvent) => {
          if (!isActive) return;
          isActive = false;
          if (rafId !== null) cancelAnimationFrame(rafId);
          targetElement.removeEventListener('pointermove', onPointerMove);
          for (const type of END_EVENTS) targetElement.removeEventListener(type, endResize);
          if (targetElement.hasPointerCapture(endEvent.pointerId)) targetElement.releasePointerCapture(endEvent.pointerId);

          setColumnWidths(prev => ({ ...prev, [key]: currentWidth }));
      };

      targetElement.addEventListener('pointermove', onPointerMove);
      for (const type of END_EVENTS) targetElement.addEventListener(type, endResize);
      rafId = requestAnimationFrame(tick);
  };


  return { columnWidths, setColumnWidths, autoLastColWidth, handleResizeStart };
}
