# Extension releases

One folder per extension version that was built and handed out: `publish/<version>/`.

- `v<version>.md` lists what changed in the extension since the previous version. It is committed.
- `demacia-bom-extension-<browser>-<version>.zip` are the zips (`npm run package:extension` writes them here). They are git-ignored, because they contain the client secret: share them only inside the team.
- The version comes from `package.json`. Bump it before building a new zip, or the old one is overwritten.

Website changes are logged in `src/upd. logs/`, server changes in `server/upd. logs/`.

| Version | Built | Highlights |
|---|---|---|
| [2.0.0](2.0.0/v2.0.0.md) | 2026-11-15 20:13 | Safe Publish BOM, correct sub-assembly quantities, vendor parts always standard, no ghost rows |
| [1.0.0](1.0.0/v1.0.0.md) | 2026-11-14 23:00 | The version in use before the code review |
