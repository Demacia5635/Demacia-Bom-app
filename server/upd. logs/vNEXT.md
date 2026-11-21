# Server: next version

**Unreleased.** On branch `fix/serv` (`bc677c7`–`988b200`), not on `MASTER` yet.

## Before you deploy

- Redeploy on Render by hand after merging.
- **The first start builds one new database index** (work orders by creation time). It's small and builds by itself; no data changes.

## New

- **`GET /api` shows the server's version, when it started, and whether the database is connected.** Handy to check a Render redeploy. (QS1, `bc677c7`)
- **`GET /api/db/bom/tree/:id` returns a whole BOM tree in one request:** the BOM, all its sub-assemblies and their parts, plus which records are missing. Shared sub-assemblies and loops are fetched once; at most 10 levels and 2000 BOMs. (QS10, `09cbf9d`)
- **Records remember who saved them last** (`updatedBy`), from the `X-Updated-By` header: the extension sends the Onshape user name, the website "website". It can be faked until sign-in exists, so it's a convenience, not an audit log. (QS12, `6559590`)
- The list routes (`/db/part/all`, `/db/bom/all`, `/db/workOrder/all`) accept optional `?limit=`, `?after=` and `?q=` for paging and search. Without them they work exactly as before. (QS7, `68f042b`)
- `GET /db/workOrder/all?bomID=<id>` lists only the work orders of that assembly (for the website's "Work orders for this assembly"). (`988b200`)
- `server/API.md` documents every route; `server/.env.example` lists every setting; `npm run server` starts the server locally (after `npm --prefix server install` once). (QS16, QS18: `b74f15f`, `ba4e927`, `e6e89ea`)

## Changes

- **Deleting a BOM is turned off.** Both delete routes answer 405 "Deleting BOMs is turned off" (the user's decision: no BOM is deleted for now). Nothing used them. (`6e80ae2`)
- **Deleted or replaced Drive files go to Drive's trash** (kept 30 days) instead of being deleted for good. (QS15, `a1bc17a`)
- Every error reply has the same shape: `{ code, message, fields?, requestId }`. Clients that read `message` work as before. (QS6, `e8e40ad`)
- Every reply has an `X-Request-Id`, also written in the server log, so an error can be found in Render's logs. (QS4, `88012ae`)
- Unchanged lists come back as a short "304 Not modified", and browsers remember the permission check for 2 hours, so repeat loads are a bit faster. (QS8, QS9: `93bf94f`, `18fd20d`)
- On a redeploy, running requests finish before the server stops. Stuck Drive requests time out (30 s, uploads 120 s). The server logs a one-line settings summary on start (no secrets). (QS2, QS5, QS3: `e3e3061`, `f537912`, `886673c`)
- New work-order parts no longer get the unused `quantityTotal` / `quantityMade` defaults. Stored data is unchanged. (O7, `cc181a3`)
- An index for the work-order list's order. (QS11, `3e30482`)

## Decided, not done

- No trash for deleted records (QS13), no export route (QS14), no test packages (QS17): the user's choice.

## Not tested yet

- Nothing has run against the real database or Drive; checked by starting the server without a database and with mocks.
