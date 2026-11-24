# Server: next version

**Unreleased.** On branch `fix/serv`, not on `MASTER` yet.

## Before you deploy

- After deploying, start the revisions with the admin route below: **dry run first**, read it, then the real run.

## New

- **Parts have a revision number.** The server sets it on every save of a made part (from Publish or the website): a new part starts at 1, and a save that changes the part's data adds 1. Data means name, catalog number, description, material, engineer, comments, vendor, price, mass, size and the STL / Parasolid ticks; re-exported files, "who saved it" and save times don't count. Standard parts have no revision; a part unmarked as standard starts again at 1. The old hand-typed Revision is replaced: anything sent in it is ignored. (`f410ea3`)
- **Admin route to start every existing part at revision 1:** `POST /api/db/part/revisions/init` with `{"dryRun":true}` first. The dry run lists how many parts get 1, how many standard parts are cleared, and every hand-typed revision that will be overwritten (name and old value). Then the same with `{}` does it. Running it again changes nothing. (`b6df30c`)
  `curl.exe -X POST "https://demacia-bom-app-n2ag.onrender.com/api/db/part/revisions/init" -H "x-client-secret: <CLIENT>" -H "x-admin-secret: <ADMIN>" -H "Content-Type: application/json" -d "{\"dryRun\":true}"`

## Not tested yet

- Nothing has run against the real database (tested with stand-in data).
- A shape change that keeps the same size and mass doesn't change the revision yet; a test in Onshape is pending.
