# Server: next version

**Unreleased.** On branch `fix/serv`, not on `MASTER` yet.

## Before you deploy

- **Two new kinds of database writes** (both approved): a capped `events` collection (the last ~5000 events, created on first use, the oldest dropped automatically), and two fields stored on each NEW work order's parts (`revisionAtCreation`, `quantityAtCreation`). Nothing existing is changed.

## New

All new routes are admin-only (the admin secret, with the guessing guard). They feed the website's new admin pages.

- **`GET /api/admin/status`** (`#/server`): version, uptime, database and Drive status, the last 10 Drive sort / cleanup runs, admin lockouts, and response times per route (median, 95th percentile, slowest) over the last 1000 requests. These figures are kept in memory and start over when the server restarts. (`5cfa4bc`)
- **`GET /api/admin/production`** (`#/production`): open work orders (not 100% finished), blocked lines (bought items still "To buy", made parts with no material), and totals by status, manufacturing method and owner. (`89b4d46`)
- **`GET /api/admin/files`** and **`POST /api/admin/files/delete`** (`#/files`): counts and sizes of the Drive files, parts that want a file but lack one, files no record uses, the largest files (one Drive listing, cached for 10 minutes). Unused files are deleted exactly like parts on `#/orphans`: re-checked right before, moved to the Drive trash, one log line each. (`dc5ee3e`)
- **An events log** (`GET /api/admin/events`, for `#/activity`): new parts, revision changes (from → to, which fields, who), part and file deletes, one event per published assembly, work-order changes, Drive sorts and cleanups, the revisions start and admin lockouts. Part saves that don't change the revision aren't recorded. (`6699d92`)
- **`GET /api/admin/revisions`** (`#/revisions`): recent revision changes, with the open work orders each changed part is in. (`6699d92`)
- **`GET /api/admin/stale`** (`#/stale`): work orders whose parts changed since the order was made. Exact for work orders created from now on (each part's revision and quantity are remembered at creation); older orders get an approximate "edited since" check. (`8104a61`)
- Usage statistics accept the extension's new fields: error code, items, problems, browser. (`268d2f1`)

## Not tested yet

- Nothing has run against the real database or Drive (tested with stand-in data).
