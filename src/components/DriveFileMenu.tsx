import { useEffect, useState } from "react";
import { openInDrive } from "../util/driveLinks";

interface DriveMenuState {
  x: number;
  y: number;
  fileId: string;
  label: string;
}

/**
 * The website's "Open … in Google Drive" right-click menu, for any element
 * marked with driveFileAttrs (saved images, Part Portal's STL / Parasolid
 * buttons). Mounted once (MainLayout). A page's own right-click menu (the BOM
 * and work-order tables) handles the event first and adds the item itself
 * (DriveMenuItem).
 */
export default function DriveFileMenu() {
  const [menu, setMenu] = useState<DriveMenuState | null>(null);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const el = (e.target as Element | null)?.closest?.("[data-drive-file-id]");
      const fileId = el?.getAttribute("data-drive-file-id");
      if (!fileId) {
        setMenu(null);
        return;
      }
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, fileId, label: el?.getAttribute("data-drive-file-label") || "file" });
    };
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, []);

  if (!menu) return null;
  return (
    <div className="context-menu drive-file-menu" style={{ top: menu.y, left: menu.x }} onClick={(e) => e.stopPropagation()}>
      <DriveMenuItem label={menu.label} fileId={menu.fileId} onDone={() => setMenu(null)} />
    </div>
  );
}

/** "Open <label> in Google Drive"; greyed out without a file. */
export function DriveMenuItem({ label, fileId, onDone }: { label: string; fileId: string | null | undefined; onDone: () => void }) {
  return (
    <button
      type="button"
      disabled={!fileId}
      title={fileId ? undefined : `No ${label} saved for this part`}
      onClick={() => {
        if (fileId) openInDrive(fileId);
        onDone();
      }}
    >
      Open {label} in Google Drive
    </button>
  );
}
