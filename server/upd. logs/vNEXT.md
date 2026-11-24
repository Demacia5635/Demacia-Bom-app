# Server: next version

**Unreleased.** On branch `fix/serv`, not on `MASTER` yet.

## Before you deploy

- After deploying, run the repair below: **dry run first**, read the list, then the real run.

## New

- **One-off repair for work-order lines stuck as finished.** A bug in the website (fixed in website 2.4.1) left some lines with Priority "Finished" but a status that isn't finished, so they kept counting as finished. `POST /api/admin/workorders/repair-finished` (admin) sets their Priority to "Medium", for made and bought lines alike. The dry run (`{"dryRun":true}`) lists each work order, part and status; `{}` does it. "Last updated" isn't changed, and running it again changes nothing. (`80faa34`)
  `curl.exe -X POST "https://demacia-bom-app-n2ag.onrender.com/api/admin/workorders/repair-finished" -H "x-client-secret: <CLIENT>" -H "x-admin-secret: <ADMIN>" -H "Content-Type: application/json" -d "{\"dryRun\":true}"`

## Not tested yet

- Tested with stand-in data only.
