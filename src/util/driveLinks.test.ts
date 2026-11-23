import { describe, expect, it } from "vitest";
import { driveFileAttrs, driveFileIdFromSrc, driveViewUrl } from "./driveLinks";
import { driveFileOfCell } from "../Pages/Subpages/partColumns";

describe("driveFileIdFromSrc", () => {
  it("reads the ID from our server's Drive image path, relative or absolute", () => {
    expect(driveFileIdFromSrc("/api/drive/file/id/abc123")).toBe("abc123");
    expect(driveFileIdFromSrc("https://bom.onrender.com/api/drive/file/id/abc%2D1?x=1")).toBe("abc-1");
  });

  it("is null for inline, outside or missing images", () => {
    expect(driveFileIdFromSrc("data:image/png;base64,AAAA")).toBeNull();
    expect(driveFileIdFromSrc("https://example.com/a.png")).toBeNull();
    expect(driveFileIdFromSrc("")).toBeNull();
    expect(driveFileIdFromSrc(undefined)).toBeNull();
  });
});

describe("driveViewUrl / driveFileAttrs", () => {
  it("links to the file's page in Google Drive", () => {
    expect(driveViewUrl("abc123")).toBe("https://drive.google.com/file/d/abc123/view");
  });

  it("marks an element only when there's a file", () => {
    expect(driveFileAttrs("abc", "STL")).toEqual({ "data-drive-file-id": "abc", "data-drive-file-label": "STL" });
    expect(driveFileAttrs("", "STL")).toEqual({});
  });
});

describe("driveFileOfCell", () => {
  const row = { name: "Bracket", avatar: "/api/drive/file/id/img1", exportSTL: "stl1", exportParasolid: "" };

  it("gives the file of the image, STL and Parasolid cells (null when the row has none)", () => {
    expect(driveFileOfCell("avatar", row)).toEqual({ label: "image", fileId: "img1" });
    expect(driveFileOfCell("exportSTL", row)).toEqual({ label: "STL", fileId: "stl1" });
    expect(driveFileOfCell("exportParasolid", row)).toEqual({ label: "Parasolid", fileId: null });
  });

  it("is null for other columns, and has no file for blocked rows", () => {
    expect(driveFileOfCell("name", row)).toBeNull();
    expect(driveFileOfCell(undefined, row)).toBeNull();
    expect(driveFileOfCell("exportSTL", row, () => true)).toEqual({ label: "STL", fileId: null });
  });
});
