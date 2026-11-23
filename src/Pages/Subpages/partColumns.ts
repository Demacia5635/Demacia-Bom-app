/**
 * Table columns the BOM page and the work-order page share: the link that
 * opens a row in Onshape, and the STL / Parasolid downloads (files saved in
 * Google Drive on publish; no Onshape fallback).
 */
import type { ColumnConfig, RowData } from "../../components/Table";
import { downloadDriveFile } from "../../util/ApiService";
import { openExternal } from "../../util/openExternal";
import { driveFileIdFromSrc } from "../../util/driveLinks";

interface FileRow {
  name?: string;
  exportSTL?: string;
  exportParasolid?: string;
}

/** A button opening the row's Onshape page; disabled when `url` gives none. */
export function cadLinkColumn<Row extends RowData>(options: { label: string; buttonText: string; url: (row: Row) => string | undefined }): ColumnConfig<Row> {
  return {
    key: "onshapeURL",
    label: options.label,
    type: "button",
    buttonText: options.buttonText,
    isDisabled: (row: Row) => !options.url(row),
    onButtonClick: (row: Row) => {
      const url = options.url(row);
      if (url) openExternal(url);
    },
  };
}

/** "Export STL" and "Export Parasolid" downloads; `blocked` rows (e.g. sub-assemblies) never download. */
export function fileDownloadColumns<Row extends RowData & FileRow>(blocked: (row: Row) => boolean = () => false): ColumnConfig<Row>[] {
  const column = (key: "exportSTL" | "exportParasolid", label: string, extension: string): ColumnConfig<Row> => ({
    key,
    label,
    type: "button",
    buttonText: "Download",
    isDisabled: (row: Row) => blocked(row) || !row[key],
    onButtonClick: (row: Row) => {
      const fileId = row[key];
      if (blocked(row) || !fileId) return;
      void downloadDriveFile(fileId, `${row.name || "part"}.${extension}`);
    },
  });
  return [column("exportSTL", "Export STL", "stl"), column("exportParasolid", "Export Parasolid", "x_t")];
}

/**
 * The Drive file behind a right-clicked cell, for the row menu's "Open … in
 * Google Drive": the image (Avatar), STL or Parasolid. `fileId` is null (the
 * item greyed out) when the row has none; null for other columns.
 */
export function driveFileOfCell<Row extends FileRow & { avatar?: string }>(
  colKey: string | undefined,
  row: Row,
  blocked: (row: Row) => boolean = () => false,
): { label: string; fileId: string | null } | null {
  if (colKey === "avatar") return { label: "image", fileId: driveFileIdFromSrc(row.avatar) };
  if (colKey === "exportSTL") return { label: "STL", fileId: blocked(row) ? null : row.exportSTL || null };
  if (colKey === "exportParasolid") return { label: "Parasolid", fileId: blocked(row) ? null : row.exportParasolid || null };
  return null;
}
