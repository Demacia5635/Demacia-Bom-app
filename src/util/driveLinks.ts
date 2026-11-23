import { openExternal } from "./openExternal";

/**
 * Files saved in the team's Google Drive (images, STL, Parasolid) are stored
 * by Drive file ID; the website shows images through our server
 * (/api/drive/file/id/<id>). These open the file in Google Drive itself.
 */

const DRIVE_IMAGE_PATH = /\/api\/drive\/file\/id\/([^/?#]+)/;

/** The Drive file ID in an image src served by our server, or null (inline / outside images). */
export function driveFileIdFromSrc(src: string | null | undefined): string | null {
  if (!src || src.startsWith("data:")) return null;
  const match = DRIVE_IMAGE_PATH.exec(src);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]) || null;
  } catch {
    return null;
  }
}

/** The file's page in Google Drive. */
export function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

/** Opens the file in Google Drive in a new tab. */
export function openInDrive(fileId: string): void {
  openExternal(driveViewUrl(fileId));
}

/**
 * Put on an element showing a Drive file (an image, a download button) to give
 * it the "Open … in Google Drive" right-click menu (DriveFileMenu). Nothing
 * when there's no file.
 */
export function driveFileAttrs(fileId: string | null | undefined, label: string): Record<string, string> {
  return fileId ? { "data-drive-file-id": fileId, "data-drive-file-label": label } : {};
}
