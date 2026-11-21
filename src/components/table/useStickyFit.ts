import { useEffect, useState, type RefObject } from "react";

/**
 * Sticky header: the table must scroll inside its own box for the header to
 * stay pinned, so the box is sized to reach the bottom of the window. Returns
 * that height (null when `stickyHeader` is off or not measured yet).
 */
export function useStickyFit(wrapperRef: RefObject<HTMLDivElement | null>, stickyHeader: boolean) {
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!stickyHeader) return;
    const fit = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const top = wrapper.getBoundingClientRect().top + window.scrollY;
      // Leave room for the synced horizontal scrollbar under the table.
      setFitHeight(Math.max(200, window.innerHeight - top - 24));
    };
    fit();
    window.addEventListener('resize', fit);
    const ro = new ResizeObserver(fit);
    if (wrapperRef.current?.parentElement) ro.observe(wrapperRef.current.parentElement);
    return () => {
      window.removeEventListener('resize', fit);
      ro.disconnect();
    };
  }, [stickyHeader, wrapperRef]);
  return fitHeight;
}
