import DeleteDialog from "../../components/bulkDelete/DeleteDialog";
import type { OrphanPart } from "./OrphansPage";
import { deleteOrphans } from "./orphanDelete";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const partName = (p: OrphanPart) => p.name || p.catalogNumber || p.id;

/**
 * Deletes one part (its card's Delete) or several (Bulk delete) that no
 * assembly uses (server: POST /db/part/orphans/delete, which checks each
 * again); its Drive files no other record uses go to the Drive trash.
 */
export default function DeleteOrphanDialog({ parts, onClose, onDeleted }: {
  parts: OrphanPart[];
  onClose: () => void;
  /** The ids deleted. */
  onDeleted: (ids: string[]) => void;
}) {
  const files = parts.reduce((sum, p) => sum + (p.filesToTrash ?? 0), 0);
  const what = parts.length === 1 ? "Deletes this part" : `Deletes ${plural(parts.length, "part")}`;
  return (
    <DeleteDialog
      items={parts.map((p) => ({ id: p.id, name: partName(p), detail: p.name ? p.catalogNumber : undefined }))}
      noun={["part", "parts"]}
      warning={
        files > 0
          ? `${what} and moves ${plural(files, "file")} to the Drive trash.`
          : `${what}. No files go to the Drive trash (none, or other records use them).`
      }
      deletedText={(n) => (n > 0 ? `Deleted · ${plural(n, "file")} to the Drive trash` : "Deleted")}
      run={deleteOrphans}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}
