# Server update logs

One file per version: `v<version>.md`, listing what changed in the server (`server/`). The extension's logs are in `publish/<version>/`, the website's in `src/upd. logs/`.

- The server is deployed on Render **by hand**. A push to `MASTER` doesn't redeploy it. After redeploying, open `https://demacia-bom-app-n2ag.onrender.com/api` and check that it answers `{"status":"online"}`.
- Render installs only the root `package.json`, so the server's packages must stay there.
- Versions follow `package.json` (`2.x.y`). A version with no server changes gets no file here.

| Version | Pushed | Highlights |
|---|---|---|
| [2.2.0](v2.2.0.md) | Unreleased | Parts get a size field |
| [2.0.0](v2.0.0.md) | 2026-11-15 | Refuses to start without `CLIENT_SECRET`, Drive limited to team folders, safer saves |
| [0.1.0](v0.1.0.md) | 2026-11-15 15:05 | Health check, proper error codes, settings in one place |
