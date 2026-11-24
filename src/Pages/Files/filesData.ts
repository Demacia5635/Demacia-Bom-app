import { fetchFromApi } from "../../util/ApiService";
import { runDeleteBatches, type DeleteOutcome } from "../../components/bulkDelete/bulkDelete";

/** The Drive overview (server: GET /api/admin/files, cached 10 minutes; ?refresh=1 lists Drive again). */
export interface FileRef {
  fileId: string;
  name: string;
  bytes: number;
  type: string;
  path?: string;
}

export interface FilesReply {
  generatedAt: string;
  totals: { files: number; bytes: number };
  types: { type: string; folderId?: string; files: number; bytes: number; folders: { path: string; files: number; bytes: number }[] }[];
  largest: (FileRef & { usedBy?: { kind: "part" | "bom"; id: string; name?: string } })[];
  unused: (FileRef & { modifiedTime?: string })[];
  missing: { kind: "part" | "bom"; id: string; name?: string; field: string; reason: string }[];
}

/** 14020000 → "13.4 MB". */
export function formatBytes(bytes: number | undefined): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

/** What a missing link's field is, in words. */
export function fieldLabel(field: string): string {
  switch (field) {
    case "avatarID":
    case "driveFileId":
      return "Image";
    case "stlLink":
    case "wantStl":
      return "STL";
    case "parasolidLink":
    case "wantParasolid":
      return "Parasolid";
    default:
      return field;
  }
}

/** Moves unused Drive files to the trash (server: POST /api/admin/files/delete, which checks each again), 200 at a time. */
export function deleteFiles(ids: string[], secret: string, onProgress?: (done: number, total: number) => void): Promise<DeleteOutcome> {
  return runDeleteBatches(
    ids,
    async (batch) => {
      const reply = await fetchFromApi<{ deleted: { fileId: string }[]; refused: { fileId: string; reason: string }[] }>("/admin/files/delete", {
        method: "POST",
        headers: { "x-admin-secret": secret },
        body: JSON.stringify({ ids: batch }),
      });
      return {
        deleted: (reply?.deleted ?? []).map((d) => [d.fileId, 0]),
        refused: (reply?.refused ?? []).map((r) => [r.fileId, r.reason]),
      };
    },
    onProgress,
  );
}
