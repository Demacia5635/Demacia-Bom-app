# Website update logs

One file per website version: `v<version>.md`, listing what that deploy changed on the website. The extension's logs are in `publish/<version>/`, the server's in `server/upd. logs/`.

## Version numbers

- The website has its own version, in `site-version.json`; it's shown in the top bar. (`package.json`'s version is the extension's.)
- **Every push to `MASTER` that changes the website is a new website version** (GitHub Pages deploys each push):
  - a normal deploy: **+0.0.1** (e.g. 2.0.1 → 2.0.2);
  - a medium update or batch of fixes: **+0.1.0** (e.g. 2.0.2 → 2.1.0);
  - a large update: **+1.0.0** (e.g. 2.1.0 → 3.0.0).
- Bump `site-version.json` before pushing. Pushes that only change the server, the extension or the logs get no website version.
- The numbers up to 2.0.1 were given afterwards (on 2026-11-21) to the deploys as they happened.

## How the logs are kept

- Entries are written on the `upd-logs` branch, in the next version's file (marked **Unreleased**), and merged into `MASTER`. On push, the "Unreleased" line gets the date.

| Version | Pushed | Highlights |
|---|---|---|
| [2.1.0](v2.1.0.md) | Not pushed yet | Quality-of-life round: search, links between pages, save indicator, CSV, progress, phone layout, What's new, charts |
| [2.0.2](v2.0.2.md) | 2026-11-21 18:55 | The website's own version number |
| [2.0.1](v2.0.1.md) | 2026-11-21 18:35 | Follow-ups after the code review |
| [2.0.0](v2.0.0.md) | 2026-11-21 18:23 | Code-review fixes and cleanup (large) |
| [1.3.4](v1.3.4.md) | 2026-11-21 17:28 | Table back to before |
| [1.3.3](v1.3.3.md) | 2026-11-21 16:27 | Row-menu option removed |
| [1.3.2](v1.3.2.md) | 2026-11-21 15:48 | Table options for the extension |
| [1.3.1](v1.3.1.md) | 2026-11-21 14:59 | Marked standard = bought |
| [1.3.0](v1.3.0.md) | 2026-11-17 23:18 | CNC jobs in work orders |
| [1.2.0](v1.2.0.md) | 2026-11-17 22:52 | Show part sizes |
| [1.1.0](v1.1.0.md) | 2026-11-16 22:59 | BOM page views |
| [1.0.1](v1.0.1.md) | 2026-11-15 21:36 | Work-order PDF: catalogue column |
| [1.0.0](v1.0.0.md) | 2026-11-15 20:13 | Standard Parts page, PDF export, safer saves (large) |
| [0.7.0](v0.7.0.md) | 2026-11-15 17:30 | Table fixes and Search Parts |
| [0.6.1](v0.6.1.md) | 2026-11-15 15:40 | Image loading limits |
| [0.6.0](v0.6.0.md) | 2026-11-15 15:05 | First fixes from the code review |
| [0.5.0](v0.5.0.md) | 2026-11-14 23:02 | Catalog-number rules |
| [0.4.0](v0.4.0.md) | 2026-11-14 22:20 | Editable work orders |
| [0.3.1](v0.3.1.md) | 2026-11-14 21:47 | Work-order filters |
| [0.3.0](v0.3.0.md) | 2026-11-14 21:35 | Problem marks, search and checks |
| [0.2.1](v0.2.1.md) | 2026-11-14 21:12 | Standard Content locked |
| [0.2.0](v0.2.0.md) | 2026-11-14 20:56 | Faster loading and images |
| [0.1.4](v0.1.4.md) | 2026-11-14 20:09 | Usage statistics page |
| [0.1.3](v0.1.3.md) | 2026-11-14 19:59 | Frozen table header |
| [0.1.2](v0.1.2.md) | 2026-11-14 19:15 | Standard Content is purchased |
| [0.1.1](v0.1.1.md) | 2026-11-14 19:06 | Work-order creation fix |
| [0.1.0](v0.1.0.md) | 2026-11-14 18:54 | No more user accounts or Onshape-tab app |
| [0.0.4](v0.0.4.md) | 2026-11-14 17:01 | Saved images on the website |
| [0.0.3](v0.0.3.md) | 2026-11-14 16:47 | Privacy policy page |
| [0.0.2](v0.0.2.md) | 2026-11-14 15:49 | Part IDs encoded in requests |
| [0.0.1](v0.0.1.md) | 2026-11-14 14:53 | Groundwork for the BOM extension |
