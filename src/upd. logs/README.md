# Website update logs

One file per version: `v<version>.md`, listing what changed on the website. The extension's logs are in `publish/<version>/`, the server's in `server/upd. logs/`.

- Every push to `MASTER` deploys the website (GitHub Pages). Changes go in `vNEXT.md` until the next version is made; each entry says whether it's pushed yet.
- Versions up to 3.1.0 used `x.y.z` steps. From 4.0.0 on, each version is a whole number (4.0.0, 5.0.0, …), set by the team. Set `package.json` to match.

## How versions are made

- Log entries are written on the `upd-logs` branch, not on `MASTER`, in `vNEXT.md` (the extension's in `publish/next/`).
- When a new version is made (4.0.0, 5.0.0, …), `vNEXT.md` is renamed to that version, dated, and `upd-logs` is merged into `MASTER`. That merge is the new version.

| Version | Pushed | Highlights |
|---|---|---|
| [next](vNEXT.md) | Unreleased | No visible change (table options for the extension) |
| [3.1.0](v3.1.0.md) | 2026-11-21 14:59 | Items marked standard count as bought everywhere |
| [3.0.0](v3.0.0.md) | 2026-11-17 23:18 | Part sizes; CNC jobs in work orders; Printed / CNC defaults |
| [2.1.0](v2.1.0.md) | 2026-11-16 22:59 | BOM page: Single-level, Structured and Flattened views |
| [2.0.1](v2.0.1.md) | 2026-11-15 21:36 | Work-order PDF: catalogue number in its own column |
| [2.0.0](v2.0.0.md) | 2026-11-15 | Standard Parts page, work-order PDF export, safer saves, table fixes |
| [0.1.0](v0.1.0.md) | 2026-11-15 15:05 | First fixes from the code review |
