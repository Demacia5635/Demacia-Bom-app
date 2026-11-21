# Extension releases

One folder per extension version that was built and handed out: `publish/<version>/`.

- `v<version>.md` lists what changed in the extension since the previous version. It is committed.
- `demacia-bom-extension-<browser>-<version>.zip` are the zips (`npm run package:extension` writes them here). They are git-ignored, because they contain the client secret: share them only inside the team.
- The version comes from `package.json`. Bump it before building a new zip, or the old one is overwritten.

Website changes are logged in `src/upd. logs/`, server changes in `server/upd. logs/`.

## How versions are made

- Log entries are written on the `upd-logs` branch, not on `MASTER`, in `vNEXT.md` (the extension's in `publish/next/`).
- When a new version is made (4.0.0, 5.0.0, …), `vNEXT.md` is renamed to that version, dated, and `upd-logs` is merged into `MASTER`. That merge is the new version.

| Version | Built | Highlights |
|---|---|---|
| [next](next/vNEXT.md) | Not built yet | Copies of a part drawn several times combine into one row; "Not the same part" to split them; "×N copies" badge; light mode |
| [3.0.0](3.0.0/v3.0.0.md) | 2026-11-17 23:17 | Show part sizes; panel toggle; polycarbonate → Parasolid; redder problem cells |
| [2.0.0](2.0.0/v2.0.0.md) | 2026-11-15 20:13 | Safe Publish BOM, correct sub-assembly quantities, vendor parts always standard, no ghost rows |
| [1.0.0](1.0.0/v1.0.0.md) | 2026-11-14 23:00 | The version in use before the code review |
