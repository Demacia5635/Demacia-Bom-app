# Server update logs

One file per version: `v<version>.md`, listing what changed in the server (`server/`). The extension's logs are in `publish/<version>/`, the website's in `src/upd. logs/`.

- The server is deployed on Render **by hand**. A push to `MASTER` doesn't redeploy it. After redeploying, open `https://demacia-bom-app-n2ag.onrender.com/api` and check that it answers `{"status":"online"}`.
- Render installs only the root `package.json`, so the server's packages must stay there.
- The server has its own version in `server/package.json` (shown by `GET /api`). Up to 4.0.0 it shared the root `package.json`'s number with the extension. Increase it like the website's: +0.0.1 for a small deploy, +0.1.0 for a medium update, +1.0.0 for a large one. A version with no server changes gets no file here.

## How versions are made

- Log entries are written on the `upd-logs` branch, not on `MASTER`, in `vNEXT.md` (the extension's in `publish/next/`).
- When a new version is made (4.0.0, 5.0.0, …), `vNEXT.md` is renamed to that version, dated, and `upd-logs` is merged into `MASTER`. That merge is the new version.

| Version | Pushed | Highlights |
|---|---|---|
| [5.2.0](v5.2.0.md) | 2026-11-24 | Part revision numbers, set by the server |
| [5.1.2](v5.1.2.md) | 2026-11-24 | Fix: Delete on #/orphans ("Failed to fetch") |
| [5.1.1](v5.1.1.md) | 2026-11-24 | Lint cleanup (no behaviour change) |
| [5.1.0](v5.1.0.md) | 2026-11-23 | Data health, deleting parts in no assembly, cleanup after publish |
| [5.0.0](v5.0.0.md) | 2026-11-23 | Drive files sorted into assembly folders; duplicate catalog numbers blocked |
| [4.1.1](v4.1.1.md) | 2026-11-23 | Work-order summary counts bought items separately |
| [4.1.0](v4.1.0.md) | 2026-11-21 | Health info, whole-tree route, who-saved-it, Drive trash, BOM delete off |
| [4.0.0](v4.0.0.md) | 2026-11-21 | Safer uploads and inputs; CNC merge for parts added later; cleanup |
| [3.0.0](v3.0.0.md) | 2026-11-17 23:18 | Part size field; work-order CNC jobs |
| [2.0.0](v2.0.0.md) | 2026-11-15 | Refuses to start without `CLIENT_SECRET`, Drive limited to team folders, safer saves |
| [0.1.0](v0.1.0.md) | 2026-11-15 15:05 | Health check, proper error codes, settings in one place |
