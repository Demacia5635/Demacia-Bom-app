# Server API

Every route of the Express server in `server/`, its body and its replies. The routes are in `server/routes/`, the handlers in `server/controllers/`.

## Basics

- **Base URL:** `https://demacia-bom-app-n2ag.onrender.com/api` (local: `http://localhost:5050/api`).
- **Auth:** every `/api` route needs the `x-client-secret` header (the shared `CLIENT_SECRET`). Two routes are public: `GET /api` and `GET /api/drive/file/id/:fileID` (so images load in `<img>` tags). A browser `Origin` must be in `ALLOWED_ORIGINS` (localhost is allowed too, unless `NODE_ENV=production`).
- **Bodies** are JSON, up to 2 MB. File uploads are the exception: they send the raw file.
- **X-Request-Id:** every reply has one. It is also in the server's log line and in error replies, so an error can be found in Render's logs. A caller may send its own (1-64 letters, digits, `-` or `_`).
- **X-Updated-By** (optional, on writes): who is saving, URL-encoded with `encodeURIComponent` (header values can't carry Hebrew). The extension sends the Onshape user name; the website sends `website`. It's stored as `updatedBy` on the record. Nothing checks it, so it's a convenience, not an audit trail.
- **Caching:** `GET /api/db/...` replies have an `ETag` and `Cache-Control: private, no-cache`, so the browser revalidates and an unchanged reply comes back as an empty `304`.

### Errors

Every error reply has this shape:

```json
{ "code": "BAD_REQUEST", "message": "partID is required", "fields": ["partID"], "requestId": "..." }
```

- `code` follows the status: `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403, origin not allowed), `NOT_FOUND` (404), `METHOD_NOT_ALLOWED` (405), `CONFLICT` (409; a BOM save's clashes have their own codes, see the BOM routes), `TOO_LARGE` (413), `UNSUPPORTED_TYPE` (415), `TOO_MANY_REQUESTS` (429, admin secret locked), `INTERNAL` (500), `UNAVAILABLE` (503).
- `fields` (only when known) lists the input fields that were wrong.
- `message` is safe to show. For a 500 it is just "Internal server error"; the details are in the log under the `requestId`.

### Records

Parts, BOMs and work orders each have a string `id` (unique), `createdAt`, `updatedAt` and, once anyone sent `X-Updated-By`, `updatedBy`. The fields are in `server/models/`. The server sets `id`, `createdAt`, `updatedAt` and `updatedBy` itself: a body can't set them.

## Health

| Route | Reply |
|---|---|
| `GET /api` | `200 { status: "online", version, startedAt, database: "connected" \| "disconnected" }`. Public. |
| `GET /api/db` | `200 { connected: true }`, or `503 { connected: false }`. |
| `GET /api/admin/check` | **Admin:** `204` when `x-admin-secret` is right; `404` when it's missing or wrong, as for every admin route. For the website's admin unlock (below). |
| `GET /api/db/health` | Every problem in the parts and BOMs (the website's data health page), described below. Read-only. |
| `GET /api/drive` | `200` when Drive answers, `503` when it doesn't: `{ connected, ... }`. |

### `GET /api/db/health`

Every problem in the database. It reads all BOMs and all parts in two queries and does the rest in memory, so it's one call with no paging.

```json
{
  "generatedAt": "...",
  "counts": { "problems": 14, "byCode": { "MISSING_MATERIAL": 3 } },
  "codeTitles": { "MISSING_MATERIAL": "Missing material" },
  "problems": [{
    "code": "MISSING_MATERIAL", "severity": "warning", "message": "Work orders need a material for made parts.",
    "records": [{ "kind": "part", "id": "...", "name": "Bracket", "catalogNumber": "2603-1002", "onshapeURL": "...",
                  "parents": [{ "id": "...", "name": "Robot", "catalogNumber": "2603-1000" }] }]
  }]
}
```

- **`problems`** is sorted by code, then by catalog number or name.
- **`records`** has one entry for most problems and several for duplicates. A record that isn't saved has only `kind`, `id` and `parents`.
- **`parents`** lists the BOMs that list the record directly, at most 10.
- **`codeTitles`** holds a short, stable title for every code.

"Made" means not bought: not Standard Content, not marked standard, and with no vendor. The checks use the same rules that publishing and work orders use.

Severity follows the user's definitions:
- **`warning`:** data the team must fix before the item can go into a work order.
- **`error`:** data the code should have made impossible, such as a BOM pointing at a record that isn't saved.

A part that no BOM lists is reported once, as `NOT_IN_ANY_ASSEMBLY`, and isn't checked further.

| Code | Severity | What |
|---|---|---|
| `CATALOG_NUMBER_INVALID` | warning | Breaks the numbering rules (`src/util/catalogNumbers.ts`, as in the extension and "Create work order"), checked on each top-level assembly's tree. Bought items are exempt. The message is the rule's own text. |
| `CATALOG_NUMBER_DUPLICATE` | warning | Several assemblies have the same catalog number (republishing them is refused). |
| `ASSEMBLY_NAME_DUPLICATE` | warning | Assemblies with no catalog number and the same name under one parent. |
| `ASSEMBLY_IN_TWO_WORKSPACES` | warning | The same Onshape assembly saved from several workspaces or versions (with short IDs in the message). |
| `PART_MISSING`, `SUB_ASSEMBLY_MISSING` | error | A BOM lists an ID that isn't saved. |
| `MISSING_MATERIAL`, `MISSING_ENGINEER` | warning | A made part without them (work orders need them; "Standard Part" doesn't count as an engineer). |
| `MISSING_IMAGE` | warning | A made part or assembly without an image. |
| `MISSING_STL`, `MISSING_PARASOLID` | warning | A made part set to export the file (`wantStl` / `wantParasolid`) that has none. |
| `NOT_IN_ANY_ASSEMBLY` | warning | A part no BOM lists. It shouldn't exist and should be deleted (there's no delete from here). |

### Admin secret

The admin routes take the `x-admin-secret` header (the `ADMIN_SECRET` setting) as well as `x-client-secret`. The routes are:
- `GET /api/admin/check`
- `POST/GET /api/drive/organize`
- `POST /api/db/part/orphans/delete`
- `POST /api/db/part/revisions/init`

Without `ADMIN_SECRET` set, or with a wrong secret, they answer `404` as if they didn't exist.

Against guessing:
- **Delay:** every wrong try is answered after 1 s.
- **Lock:** after 10 wrong tries from one IP within 15 minutes, or 100 overall, every admin call answers `429 TOO_MANY_REQUESTS`, even one with the right secret, until 15 minutes pass with no tries.
- **IP:** it's the first `X-Forwarded-For` entry, which Render's proxy adds. Everyone behind one network address shares a counter, so 10 typos at school lock the admin pages there for 15 minutes.
- **Memory:** the counts are kept in memory, and a restart clears them.

## Parts: `/api/db/part`

| Route | Body | Reply |
|---|---|---|
| `GET /all` | | Every part, by `id`. See [Lists](#lists) for paging. |
| `POST /ids` | `{ ids: string[] }` (at most 500) | The parts that exist, in any order. Never creates any. |
| `GET /orphans` | | Read-only: the parts no BOM uses, newest first, as full part records plus `filesToTrash`: how many of the part's Drive files no other part or BOM points at. For the website's `/orphans` page. A part is **in use** when a BOM lists it in its `parts`, or when it is the part record of an assembly marked standard. An unmarked assembly's leftover part record is not in use. |
| `POST /orphans/delete` | `{ ids: string[] }` (1-200) | **Admin** (the `x-admin-secret` header as well, like the Drive sort; a missing or wrong one gets `404`). Deletes those parts if no BOM uses them, re-checking each one right before deleting it. Returns `200 { deleted: [{ id, name, catalogNumber, filesTrashed }], refused: [{ id, reason }] }`; a partial success is still `200`. A deleted part's Drive files that no other record points at go to Drive's trash, for 30 days; shared files stay. There's no undo: each delete is one server-log line with who (`X-Updated-By`), the trashed files and the whole record, so it can be restored by hand. |
| `GET /id/:id` | | The part (`onshapeID` and `onshapeURL` filled in from the id when missing), or `404`. |
| `POST /id/:id` | The part's fields | Creates or updates it: `201` created, `200` updated, with the record. A new part without a usable `name` gets one from `title`, `catalogNumber` or its Onshape part ID. An empty `name` never overwrites a saved one. |
| `DELETE /id/:id` | | `204`, or `404`. Refused with `409 PART_IN_USE` while a BOM lists the part, or while it is the part record of an assembly marked standard. An assembly's leftover part record, once its mark is removed, may go, even if its parent still lists it (the extension deletes it during a publish). Drive files are left alone. Each delete is logged with the whole record. |
| `GET /d/:documentID/wvmT/:wvmType/wvmI/:wvmID/e/:elementID/p/:partID` | | The part with this Onshape identity, or `404`. Read-only. |
| `DELETE` (same path) | | **Turned off:** `405`. |

### A part's revision

`revision` is a whole number that only the server sets; a `revision` in a request body is ignored. On every part save (from Publish or from the website):
- **A new made part** starts at `1`.
- **A save that changes the part's data** adds 1. Only the fields it sends are compared; blank and missing count as the same, and so do `1.5` and `"1.5"`. The counted fields are `name`, `catalogNumber`, `description`, `material`, `engineer`, `comments`, `vendor`, `price`, `mass`, `size`, `wantStl` and `wantParasolid`. Geometry is followed through `size` and `mass`. Drive file IDs and `filesModelVersion` don't count, because a re-export changes them for a whole Part Studio.
- **A save that changes nothing** keeps the number.
- **Standard parts** (Standard Content, marked standard, or with a vendor) have **no** `revision`; the field is absent. A part that stops being standard starts again at `1`.
- **A part saved before revisions existed** counts as `1` (`2` if that save changed it). A one-time run sets every other made part to `1`.

The rules live in `server/controllers/partRevision.ts` (`COUNTED_FIELDS`).

**The one-time start** is an admin route, `POST /api/db/part/revisions/init` with body `{ "dryRun": true }` or `{}`. It needs `x-admin-secret` as well, like the Drive sort, and answers `404` without it. It gives every made part without a whole-number revision `1`, overwriting old manual values, and removes the revision from standard parts. Parts that already have a number keep it, so running it again changes nothing.

The reply is `{ dryRun, total, standard, alreadyNumbered, setTo1, standardCleared, overwrittenCount, overwritten: [{ id, name, old }], updated? }`. `overwritten` lists up to 500 entries; `updated` holds the real run's counts. The real run writes one log line. Run the dry run first.

## BOMs (assemblies): `/api/db/bom`

| Route | Body | Reply |
|---|---|---|
| `GET /all` | | Every BOM, by `id`. See [Lists](#lists). |
| `POST /ids` | `{ ids: string[] }` (at most 500) | The BOMs that exist. |
| `GET /tree/:id` | | The whole tree in one request (below). |
| `GET /publishedElsewhere?documentID=&elementID=&wvmType=&wvmID=` | | Read-only: whether this Onshape assembly is already saved from another workspace or version, in which case saving it from this one is refused with `ASSEMBLY_PUBLISHED_ELSEWHERE`. Returns `{ elsewhere: false }` or `{ elsewhere: true, bom: { id, name, catalogNumber, onshapeURL, onshapeID: { documentID, wvmType, wvmID, elementID } } }`. Missing or malformed parameters give `400`. |
| `GET /usedIn/:id` | | The BOMs that use this one as a sub-assembly, by name: `[{ id, name, catalogNumber, quantity, driveFileId, avatarID, imageUrl, thumbnailURL }]`. `quantity` is how many of it each one lists; the image fields appear only when set. An empty list when nothing uses it. |
| `GET /id/:id` | | The BOM, or `404`. |
| `POST /id/:id` | The BOM's fields | Creates or updates it: `201` or `200`, with the record. Refused with `409` when its folder name would clash (below). |
| `DELETE /id/:id` | | **Turned off:** `405` "Deleting BOMs is turned off". |
| `GET /d/:documentID/wvmT/:wvmType/wvmI/:wvmID/e/:elementID/b/:bomID` | | The BOM with this Onshape identity, or `404`. |
| `POST` (same path) | The BOM's fields | Creates or updates it; `onshapeID` is taken from the path. |
| `DELETE` (same path) | | **Turned off:** `405`. |

### Saving a BOM: clashes (`409`)

In the sorted Drive folders, every assembly has its own folder, named by its catalog number (or its name). So saving a BOM is refused with `409`, and nothing is saved, when:

| `code` | When | Extra fields |
|---|---|---|
| `ASSEMBLY_PUBLISHED_ELSEWHERE` | The same Onshape assembly (document + element) is already saved from another workspace or version. Its BOM is kept for one workspace only. | `publishedFrom: { documentID, wvmType, wvmID, elementID, onshapeURL }` |
| `CATALOG_NUMBER_TAKEN` | Another assembly has this catalog number. | `fields: ["catalogNumber"]` |
| `ASSEMBLY_NAME_TAKEN` | It has no catalog number, and another sub-assembly of the same parent has no catalog number and the same name. | `fields: ["name", "catalogNumber"]` |

Each reply also has `conflictsWith: { id, name }` (the other record) and a `message` to show as is. For example: "Catalog number 2714-1000 is already used by another assembly, "Arm". Give this assembly its own catalog number in Onshape, then publish again. Nothing was saved." Saving the same record again is fine, and so is a record of the same Onshape assembly and workspace (if its BOM table ID changed).

A BOM lists its parts as `parts: [{ partID, quantity }]` and its sub-assemblies as `subAssemblies: [{ bomID, quantity }]`.

### `GET /api/db/bom/tree/:id`

```json
{
  "rootID": "...",
  "boms": [ /* the root and every sub-assembly at any depth, as records */ ],
  "parts": [ /* every part those BOMs list, as records */ ],
  "missing": { "boms": ["ids listed but not saved"], "parts": ["..."] },
  "truncated": false
}
```

The server makes one query per level, then one for all the parts. A sub-assembly that appears twice (shared, or in a cycle) is fetched once. `truncated` is `true` when the tree goes more than 10 levels below the root or past 2000 BOMs; anything beyond that is left out. If the root is missing, the reply is `404`. The records are the same as those `POST /ids` returns.

## Work orders: `/api/db/workOrder`

| Route | Body | Reply |
|---|---|---|
| `GET /all` | | Every work order, oldest first. `?bomID=` keeps only the work orders of that assembly (also with paging). See [Lists](#lists). |
| `GET /summary` | | Every work order with its progress (below). |
| `GET /id/:id` | | The work order, or `404`. |
| `POST /id/:id` | The work order's fields | Creates or updates it: `201` or `200`. `parts` is used only on create (deduplicated by `partID`, first wins); `cncGroups` is ignored. Both change only through the routes below. |
| `POST /id/:id/part` | `{ partID, changes: { field: value } }` | Changes one part of the work order (it is added if missing). Returns that part. Editable fields: `statusCode`, `Priority`, `manufacturingMethod`, `productionGCOwner`, `productionMakingOwner`, `comments`, `links`, `approxArrivalDate`, `quantityMade`. |
| `POST /id/:id/cncGroup` | `{ groupID?, partIDs?, links? }` | Creates, changes or dissolves a CNC group (parts cut together that share one G-code link). Returns `{ groupID, cncGroups }`. |
| `DELETE /id/:id` | | `204`, or `404`. |

How the CNC-group route behaves:

- **No `groupID`:** a new group. It needs at least 2 `partIDs`, and the server makes its ID.
- **`partIDs`:** the group's parts (at most 500, each up to 200 characters). A part leaves any other group it was in. A group left with fewer than 2 parts is removed, so `[]` dissolves it. A part that the work order's `parts` doesn't list yet is added to it.
- **`links`:** up to 4000 characters. Left out, the links don't change.
- **A `groupID` with no `partIDs`:** changes only the links. If someone else removed the group meanwhile, the reply is `409`.

The whole change is a single atomic update, so people merging at the same time don't overwrite each other.

### `GET /api/db/workOrder/summary`

Every work order, oldest first, with its progress counted from its assembly's **live** BOM, the same way the work-order page does:

```json
[{
  "id": "...", "name": "...", "owner": "...", "createdAt": "...", "updatedAt": "...", "bomID": "...",
  "lines": 40, "trackedParts": 35, "madeParts": 28, "finishedParts": 12,
  "madeQty": 90, "finishedQty": 31, "totalQty": 120,
  "byStatus": { "In Planning": 10, "In manufacturing": 6, "Finished Manufacturing": 12 },
  "purchased": { "lines": 9, "toBuy": 4, "finished": 3, "untracked": 2 }
}]
```

- **Lines:** every part, with each quantity multiplied through its sub-assemblies. A bought sub-assembly (marked standard, or with a vendor) is one line.
- **A line's status:** the stored one (old numeric codes become names; the default is "In Planning"). A bought sub-assembly with no stored entry is "Untracked".
- **`trackedParts`:** lines that aren't "Untracked".
- **`madeParts`:** lines the team makes, which the bar divides by. A line is excluded if it's purchased (Standard Content, marked standard, has a vendor, or its method is "Purchased") or "Untracked".
- **`finishedParts`:** made lines whose status is "Finished Manufacturing" or whose priority is "Finished".
- **`*Qty`:** the same counts, as total quantities.
- **`byStatus`:** counts made lines only (the same lines as `madeParts`), by status.
- **`purchased`:** the bought lines (purchased, as above), by their bought status:
  - `finished`: status "Finished Manufacturing" or "Finished", or priority "Finished".
  - `untracked`: status "Untracked". A bought sub-assembly with no stored entry is also untracked.
  - `toBuy`: anything else, including "To buy" and a line with no stored entry.

  A line that isn't purchased but is "Untracked" (made outside the team) is in neither `byStatus` nor `purchased`.
- **Errors:** a work order whose tree can't be built (no assembly, a missing assembly, an assembly that contains itself) has `error` with the page's message and no counts.

The whole list costs one query for the work orders, one per BOM level for all of them together, and one for the parts.

## Lists

`GET /api/db/part/all`, `/bom/all` and `/workOrder/all`:

- **No parameters:** every record, as an array.
- **With any of `limit`, `after`, `q`:** one page, as `{ items, next }`, ordered by `id`:
  - `limit`: 1-500, default 100.
  - `after`: the previous page's `next`.
  - `q`: text that one of these fields contains, in any case. Parts: `name`, `catalogNumber`, `description`, `vendor`, `id`. BOMs: `name`, `catalogNumber`, `projectCatalogNumber`, `description`, `id`. Work orders: `name`, `description`, `workOrderOwner`, `id`.
  - `next` is `null` on the last page.
- **Work orders only:** `?bomID=<assembly id>` keeps just that assembly's work orders, with or without paging.

## Google Drive: `/api/drive`

| Route | Body | Reply |
|---|---|---|
| `GET /file/id/:fileID` | | The file's content. **Public.** Only files in the three team folders are served; anything else is `404`. A malformed ID is `400`. Images keep their type; anything else is sent as `application/octet-stream`. The browser may cache it for a day (`private`). |
| `POST /file/name/:fileName/mime/:mimeType` | The raw file, up to 20 MB | Uploads it to the image, STL or Parasolid folder, chosen by type, and returns `201` with the Drive file. Only `png`, `jpg`/`jpeg` and `webp` images, `stl`, and `x_t`/`x_b` files are accepted, with a MIME type that fits the extension (CAD files may also be `application/octet-stream`). Anything else is `415`; too large is `413`. |
| `DELETE /file/id/:fileID` | | Moves a team-folder file to Drive's trash (Drive empties it after 30 days): `204`, or `404`. |

Drive requests time out after 30 s, and uploads after 120 s.

### Sorted folders

Inside each type folder (Images, STL, Parasolid), the files are sorted into one folder per assembly, nested like the BOM tree, for example `Images/2714-0000/2714-1000/2714-1100`. The rules (`server/services/driveFolderPlan.ts`):

- **Folder name:** the assembly's catalog number, or its name if it has none. Saving a BOM whose folder name would clash is refused (see the BOM routes).
- **An assembly's own image** goes in its own folder.
- **A part's files** go in the folder of the first assembly that lists it. "First" follows a fixed order: top-level assemblies (listed in no other BOM) oldest first, by `createdAt` then `id`. Each one is walked depth-first: its own parts before its sub-assemblies, both in BOM order. A file only moves when a BOM or a catalog number changes.
- **Bought items** go in `Standard parts`, directly inside the type folder. A bought part goes there directly. A bought sub-assembly gets its own folder there, with everything inside it nested the same way.
- **Files no assembly reaches** (parts in no BOM) stay where they are.
- **Files are moved, never copied or deleted:** their IDs and links stay, and the database doesn't change. Folders are found or created by name, never twice. Emptied folders are left alone.

The server sorts an assembly's tree by itself after a publish: 60 s after the last BOM save in that tree, in the background (it never delays or fails a save).

Just before that sort, the same background run deletes the parts the publish dropped from its BOMs that no BOM uses by then, under the same rules as `POST /api/db/part/orphans/delete`: it re-checks each part, moves unshared Drive files to Drive's trash, and writes one log line per part. A part moved between sub-assemblies within one publish is listed again by then, so it stays. Only parts a publish dropped are considered; other orphans are left to the `/orphans` page. If the cleanup fails, the sort still runs. The first full sort is started by hand with the admin routes below.

### Admin: `/api/drive/organize`

These routes need the `x-admin-secret` header (the `ADMIN_SECRET` setting, set only on Render) as well as `x-client-secret`. Without `ADMIN_SECRET` set, or with a wrong one, they answer `404`.

| Route | Body | Reply |
|---|---|---|
| `POST /organize` | `{ "dryRun": true }` or `{}` | Starts a sort in the background: `202 { jobId, dryRun, status }`, or `409` if one is running. A dry run creates and moves nothing; it reports what it would do. |
| `GET /organize/:jobId` | | The job (below), or `404`. |
| `GET /organize` | | The last 10 jobs, without their lists (in memory: a restart forgets them). |

A job:

```json
{
  "id": "...", "dryRun": true, "trigger": "manual", "status": "running | done | failed",
  "startedAt": "...", "finishedAt": "...", "progress": { "done": 120, "total": 480 },
  "summary": { "moved": 300, "alreadyInPlace": 150, "notInAnyAssembly": 12, "skipped": { "not found in Drive": 3 }, "foldersCreated": 40 },
  "moves": [{ "fileId": "...", "record": { "kind": "part", "id": "...", "name": "Plate" }, "field": "stlLink", "from": "STL", "to": "STL/2714-0000/2714-1000" }],
  "skipped": [{ "fileId": "...", "record": { "kind": "part", "id": "..." }, "reason": "in Drive's trash" }],
  "clashes": {
    "catalogNumbers": [{ "catalogNumber": "2714-1000", "boms": [{ "id": "...", "name": "..." }] }],
    "names": [],
    "workspaces": [{ "documentID": "...", "elementID": "...", "boms": [{ "id": "...", "name": "...", "catalogNumber": "...", "wvmType": "w", "wvmID": "..." }] }]
  },
  "cleanup": { "candidates": 2, "deleted": [{ "id": "...", "name": "...", "filesTrashed": ["..."] }], "kept": [{ "id": "...", "reason": "is used by assembly Base (...)" }], "error": "..." },
  "error": "..."
}
```

- **`cleanup`** (publish runs only) covers the dropped parts: those deleted, and those kept because something uses them again. The log line ends with, for example, `cleanup: 1 deleted, 1 kept (...)`.

- **In a dry run,** `moved` and `foldersCreated` mean "would move" and "would create".
- **`clashes`** lists the existing records that will be refused when they're published again, so they can be fixed first:
  - `catalogNumbers`: assemblies sharing a catalog number. They also share a folder until fixed.
  - `names`: assemblies with no catalog number and the same name under one parent.
  - `workspaces`: the same Onshape assembly saved from more than one workspace or version.
- **Skip reasons:** `not found in Drive`, `in Drive's trash`, `not in a team folder`, `is a folder`, or `error: ...`.
- **Lists:** `moves` and `skipped` keep at most 5000 entries each, while the counts are always complete.
- **Repeat runs:** running a sort again moves nothing.

Drive requests are throttled to about 5 per second and retried on rate limits. The server log has a summary line for every run.

## Fixed lists: `/api/enum`

| Route | Reply |
|---|---|
| `GET /productionType/all` | The production types `[{ id, name, description }]` (`server/db/enum.ts`). |
| `GET /productionType/id/:id` | One of them, or `404`. |

## Telemetry: `/api/telemetry`

The extension's record of the Onshape calls it made, shown on the website's unlisted `/tele` page. Entries are deleted after 180 days.

| Route | Body | Reply |
|---|---|---|
| `POST /events` | `{ events: [...] }` (1-200) | `201 { saved }`. Unknown fields are dropped. Each event has `at`, `user`, `action`, `assembly`, `documentID`, `elementID`, `counts: { kind: number }`, `failed`, `durationMs`, `ok`, `error` and `version`. |
| `GET /events?limit=&since=` | | The newest events first: up to `limit` (default 500, at most 2000), from `since` (an ISO date) onward. |
| `GET /stats?from=&to=` | | Totals for charts, aggregated in MongoDB (below). |

### `GET /api/telemetry/stats`

`from` and `to` are ISO dates or times. `to` is an exact moment, so to include a whole day, send the start of the next day. The default is the last 30 days, and the range can be at most 366 days.

```json
{
  "from": "...", "to": "...", "timezone": "Asia/Jerusalem",
  "days": [{ "day": "2026-11-02", "events": 3, "requests": 40, "failed": 1, "failedEvents": 1, "byKind": { "bom": 30, "stl": 10 } }],
  "users": [{ "user": "Dana", "events": 3, "requests": 40, "failed": 1 }]
}
```

- **Days:** counted in Israel time. Only days with events are listed, oldest first.
- **`requests`:** the number of Onshape requests (the events' `total`).
- **`failed`:** Onshape requests that failed.
- **`failedEvents`:** operations that ended with an error.
- **`byKind`:** requests per kind.
- **`users`:** the users with the most requests come first; `""` means the user is unknown.
