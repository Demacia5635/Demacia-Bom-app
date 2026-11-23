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

- `code` follows the status: `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403, origin not allowed), `NOT_FOUND` (404), `METHOD_NOT_ALLOWED` (405), `CONFLICT` (409), `TOO_LARGE` (413), `UNSUPPORTED_TYPE` (415), `INTERNAL` (500), `UNAVAILABLE` (503).
- `fields` (only when known) lists the input fields that were wrong.
- `message` is safe to show. For a 500 it is just "Internal server error"; the details are in the log under the `requestId`.

### Records

Parts, BOMs and work orders each have a string `id` (unique), `createdAt`, `updatedAt` and, once anyone sent `X-Updated-By`, `updatedBy`. The fields are in `server/models/`. The server sets `id`, `createdAt`, `updatedAt` and `updatedBy` itself: a body can't set them.

## Health

| Route | Reply |
|---|---|
| `GET /api` | `200 { status: "online", version, startedAt, database: "connected" \| "disconnected" }`. Public. |
| `GET /api/db` | `200 { connected: true }`, or `503 { connected: false }`. |
| `GET /api/drive` | `200` when Drive answers, `503` when it doesn't: `{ connected, ... }`. |

## Parts: `/api/db/part`

| Route | Body | Reply |
|---|---|---|
| `GET /all` | | Every part, by `id`. See [Lists](#lists) for paging. |
| `POST /ids` | `{ ids: string[] }` (at most 500) | The parts that exist, in any order. Never creates any. |
| `GET /id/:id` | | The part (`onshapeID` and `onshapeURL` filled in from the id when missing), or `404`. |
| `POST /id/:id` | The part's fields | Creates or updates it: `201` created, `200` updated, with the record. A new part without a usable `name` gets one from `title`, `catalogNumber` or its Onshape part ID. An empty `name` never overwrites a saved one. |
| `DELETE /id/:id` | | `204`, or `404`. |
| `GET /d/:documentID/wvmT/:wvmType/wvmI/:wvmID/e/:elementID/p/:partID` | | The part with this Onshape identity, or `404`. Read-only. |
| `DELETE` (same path) | | Deletes it: `204`, or `404`. |

## BOMs (assemblies): `/api/db/bom`

| Route | Body | Reply |
|---|---|---|
| `GET /all` | | Every BOM, by `id`. See [Lists](#lists). |
| `POST /ids` | `{ ids: string[] }` (at most 500) | The BOMs that exist. |
| `GET /tree/:id` | | The whole tree in one request (below). |
| `GET /usedIn/:id` | | The BOMs that use this one as a sub-assembly, by name: `[{ id, name, catalogNumber, quantity, driveFileId, avatarID, imageUrl, thumbnailURL }]`. `quantity` is how many of it each one lists; the image fields appear only when set. An empty list when nothing uses it. |
| `GET /id/:id` | | The BOM, or `404`. |
| `POST /id/:id` | The BOM's fields | Creates or updates it: `201` or `200`, with the record. |
| `DELETE /id/:id` | | **Turned off:** `405` "Deleting BOMs is turned off". |
| `GET /d/:documentID/wvmT/:wvmType/wvmI/:wvmID/e/:elementID/b/:bomID` | | The BOM with this Onshape identity, or `404`. |
| `POST` (same path) | The BOM's fields | Creates or updates it; `onshapeID` is taken from the path. |
| `DELETE` (same path) | | **Turned off:** `405`. |

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
