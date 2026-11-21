import { useEffect, useState, type RefObject } from "react";

/**
 * Sticky header: the table must scroll inside its own box for the header to
 * stay pinned, so the box is sized to reach the bottom of the window. When
 * that would leave it short (on a phone the table starts far down the page),
 * it's as tall as the window under the top bar instead: scroll the page down
 * to it and the table fills the screen. Returns that height (null when
 * `stickyHeader` is off or not measured yet).
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
      const toBottom = window.innerHeight - top - 24;
      const fullScreen = window.innerHeight - 48 /* the top bar */ - 32;
      setFitHeight(toBottom >= Math.min(360, fullScreen) ? toBottom : Math.max(200, fullScreen));
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
