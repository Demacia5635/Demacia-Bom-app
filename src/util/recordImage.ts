/**
 * Image src for a saved part, BOM or work order, from what's stored on the
 * record. Images live in Google Drive (served by /api/drive/file/id/:id):
 * - `driveFileId`: older records;
 * - `avatarID`: a Drive file ID (what the Chrome extension saves), or an
 *   inline `data:image/...` URL, or a full URL;
 * - `imageUrl` / `thumbnailURL`: older stored links.
 * Returns "" when there's no image; callers show a placeholder. There's no
 * Onshape fallback: that went through the server with API keys.
 */
export interface RecordWithImage {
  driveFileId?: string;
  avatarID?: string;
  imageUrl?: string;
  thumbnailURL?: string;
}

export function recordImageSrc(record: RecordWithImage | null | undefined): string {
  if (!record) return "";
  if (record.driveFileId) return `/api/drive/file/id/${record.driveFileId}`;

  const avatar = typeof record.avatarID === "string" ? record.avatarID.trim() : "";
  if (avatar) {
    if (avatar.startsWith("data:image") || /^https?:\/\//.test(avatar) || avatar.startsWith("/")) return avatar;
    return `/api/drive/file/id/${avatar}`;
  }

  return record.imageUrl || record.thumbnailURL || "";
}
