import { createPortal } from "react-dom";
import type { BomModel } from "../util/Models";

/**
 * Covers the whole panel when this assembly was already published from
 * another workspace or version of its Onshape document: the server keeps one
 * BOM per assembly and refuses a second one (409 ASSEMBLY_PUBLISHED_ELSEWHERE),
 * so nothing here should be tried. Wording approved by the user.
 */
export default function PublishedElsewhereCover({
  bom,
  publishedUrl,
  onOpen,
}: {
  /** The saved record, from the other workspace / version. */
  bom: Pick<BomModel, "name" | "catalogNumber">;
  /** The Onshape page of the workspace / version it was published from. */
  publishedUrl: string | null;
  onOpen: () => void;
}) {
  const name = String(bom.name ?? "").trim() || "This assembly";
  const catalog = String(bom.catalogNumber ?? "").trim();
  const who = catalog ? `${catalog} (${name})` : name;
  return createPortal(
    <div
      className="published-elsewhere-cover"
      role="alertdialog"
      aria-modal="true"
      aria-label="Published from another workspace"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        background: "rgba(127, 29, 29, 0.97)",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 36, lineHeight: 1 }} aria-hidden="true">
        ⛔
      </div>
      <p style={{ maxWidth: 420, fontSize: 15, lineHeight: 1.5, fontWeight: 600 }}>
        {who} was already published from another workspace or version of this Onshape document. Its BOM is kept
        for one workspace only: publish it from the workspace it was first published from.
      </p>
      {publishedUrl && (
        <button
          type="button"
          onClick={onOpen}
          style={{
            background: "#fff",
            color: "#7f1d1d",
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Open the published workspace ↗
        </button>
      )}
    </div>,
    document.body
  );
}
