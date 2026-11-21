# Website update logs

One file per version: `v<version>.md`, listing what changed on the website. The extension's logs are in `publish/<version>/`, the server's in `server/upd. logs/`.

- Every push to `MASTER` deploys the website (GitHub Pages), so every push with website changes gets a new version and file. Set `package.json` to match before pushing.
- Changes that are committed but not pushed yet go in the next version's file, marked **Unreleased**. On push, replace that line with the date.
- Versions: `3.x.y`. Increase `x` for new behaviour or many fixes, and `y` for a few small fixes.

| Version | Pushed | Highlights |
|---|---|---|
| [3.1.0](v3.1.0.md) | 2026-11-21 14:59 | Items marked standard count as bought everywhere |
| [3.0.0](v3.0.0.md) | 2026-11-17 23:18 | Part sizes; CNC jobs in work orders; Printed / CNC defaults |
| [2.1.0](v2.1.0.md) | 2026-11-16 22:59 | BOM page: Single-level, Structured and Flattened views |
| [2.0.1](v2.0.1.md) | 2026-11-15 21:36 | Work-order PDF: catalogue number in its own column |
| [2.0.0](v2.0.0.md) | 2026-11-15 | Standard Parts page, work-order PDF export, safer saves, table fixes |
| [0.1.0](v0.1.0.md) | 2026-11-15 15:05 | First fixes from the code review |
