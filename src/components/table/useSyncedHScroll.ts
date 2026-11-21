import { useEffect, useRef, useState } from "react";

/**
 * The bottom scrollbar under a Table: it scrolls with the table's wrapper
 * (both ways), and its spacer is as wide as the table. Put `wrapperRef` on the
 * scrolling wrapper and `bottomScrollRef` on the bottom bar; `tableWidth` is
 * the spacer's width.
 */
export function useSyncedHScroll() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState<number>(0);

  // Synchronize horizontal scrolling between the main table wrapper and the bottom scrollbar
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const bottomScroll = bottomScrollRef.current;
    if (!wrapper || !bottomScroll) return;

    const handleWrapperScroll = () => {
      if (bottomScroll.scrollLeft !== wrapper.scrollLeft) {
        bottomScroll.scrollLeft = wrapper.scrollLeft;
      }
    };

    const handleBottomScroll = () => {
      if (wrapper.scrollLeft !== bottomScroll.scrollLeft) {
        wrapper.scrollLeft = bottomScroll.scrollLeft;
      }
    };

    wrapper.addEventListener('scroll', handleWrapperScroll);
    bottomScroll.addEventListener('scroll', handleBottomScroll);

    return () => {
      wrapper.removeEventListener('scroll', handleWrapperScroll);
      bottomScroll.removeEventListener('scroll', handleBottomScroll);
    };
  }, []);

  // Track table content width for the synced bottom scrollbar spacer. The
  // <table> is always mounted and the observer follows its size, so it's
  // created once (not again after every edit).
  useEffect(() => {
    const table = wrapperRef.current?.querySelector('table');
    if (!table) return;

    const updateWidth = () => {
      setTableWidth(table.scrollWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  return { wrapperRef, bottomScrollRef, tableWidth };
}
