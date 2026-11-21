/**
 * Table columns the BOM page and the work-order page share: the link that
 * opens a row in Onshape, and the STL / Parasolid downloads (files saved in
 * Google Drive on publish; no Onshape fallback).
 */
import type { ColumnConfig } from "../../components/Table";
import { downloadDriveFile } from "../../util/ApiService";
import { openExternal } from "../../util/openExternal";

interface FileRow {
  name?: string;
  exportSTL?: string;
  exportParasolid?: string;
}

/** A button opening the row's Onshape page; disabled when `url` gives none. */
export function cadLinkColumn<Row>(options: { label: string; buttonText: string; url: (row: Row) => string | undefined }): ColumnConfig {
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
export function fileDownloadColumns<Row extends FileRow>(blocked: (row: Row) => boolean = () => false): ColumnConfig[] {
  const column = (key: "exportSTL" | "exportParasolid", label: string, extension: string): ColumnConfig => ({
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
