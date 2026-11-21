import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchFromApi } from "../util/ApiService";
import type { PartModel } from "../util/Models";
import { showToast } from "../util/toast";

/**
 * Keeps a page's open Part Portal in the address (?part=<record id>), so it
 * can be shared as a link: opening the page with ?part= opens that part, and
 * opening / closing Part Portal adds / removes it (without a history entry).
 */
export function usePartInAddress(openPart: PartModel | null, setOpenPart: (part: PartModel | null) => void) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("part");
  // The id asked for by the address when the page opened, while it loads.
  const loadingRef = useRef<string | null>(null);
  const handledRef = useRef(false);

  const writeAddress = (partId: string | null) =>
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (partId) next.set("part", partId);
        else next.delete("part");
        return next;
      },
      { replace: true }
    );

  // The part in the address when the page opens.
  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    if (!requested) return;
    loadingRef.current = requested;
    fetchFromApi<PartModel>(`/db/part/id/${encodeURIComponent(requested)}`)
      .then((part) => {
        loadingRef.current = null;
        if (part) setOpenPart(part);
        else writeAddress(null);
      })
      .catch((err: any) => {
        loadingRef.current = null;
        writeAddress(null);
        showToast(
          err?.statusCode === 404 ? "That part isn't saved in the database (yet)." : `Couldn't open the part: ${err?.message || err}`,
          err?.statusCode === 404 ? "info" : "error"
        );
      });
    // Only once, for the address the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The address follows what's open (not while the requested part loads).
  const openId = openPart?.id ?? null;
  useEffect(() => {
    if (loadingRef.current) return;
    if ((requested ?? null) === openId) return;
    writeAddress(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);
}
