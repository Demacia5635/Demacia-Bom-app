# Server update logs

One file per version: `v<version>.md`, listing what changed in the server (`server/`). The extension's logs are in `publish/<version>/`, the website's in `src/upd. logs/`.

- The server is deployed on Render **by hand**. A push to `MASTER` doesn't redeploy it. After redeploying, open `https://demacia-bom-app-n2ag.onrender.com/api` and check that it answers `{"status":"online"}`.
- Render installs only the root `package.json`, so the server's packages must stay there.
- Versions follow `package.json`; from 4.0.0 on, each version is a whole number (4.0.0, 5.0.0, …). A version with no server changes gets no file here.

## How versions are made

- Log entries are written on the `upd-logs` branch, not on `MASTER`, in `vNEXT.md` (the extension's in `publish/next/`).
- When a new version is made (4.0.0, 5.0.0, …), `vNEXT.md` is renamed to that version, dated, and `upd-logs` is merged into `MASTER`. That merge is the new version.

| Version | Pushed | Highlights |
|---|---|---|
| [4.0.0](v4.0.0.md) | 2026-11-21 | Safer uploads and inputs; CNC merge for parts added later; cleanup |
| [3.0.0](v3.0.0.md) | 2026-11-17 23:18 | Part size field; work-order CNC jobs |
| [2.0.0](v2.0.0.md) | 2026-11-15 | Refuses to start without `CLIENT_SECRET`, Drive limited to team folders, safer saves |
| [0.1.0](v0.1.0.md) | 2026-11-15 15:05 | Health check, proper error codes, settings in one place |
