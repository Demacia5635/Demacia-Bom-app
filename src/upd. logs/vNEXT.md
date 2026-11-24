# Website: next version

**Unreleased.** On branch `fix/web`, not on `MASTER` yet.

## Before you deploy

- Needs the server's next version: the new pages read admin-only routes from it.

## New

- **Admin pages, in the sidebar's ADMIN section** (unlocked at `#/admin`). A browser that isn't unlocked sees "This is an admin page. Unlock it at #/admin". The new pages' data needs the admin secret, asked once per tab. `#/tele`, `#/health` and `#/orphans` are behind the same lock now. (`6a95b1c`)
  - **`#/activity`:** a live feed of what happened: new parts, revision changes, deletes, publishes, work-order changes, Drive sorts and cleanups. Filters by kind, person and text; 100 at a time with "Load more"; new events appear every 30 s. (`0352764`)
  - **`#/production`:** a manufacturing board. Totals (open orders, blocked, still to buy, no material), parts waiting per process (CNC, Printed, Manual…), and a card per open work order with its progress and a red "Blocked" line when something is still to buy or has no material. Finished orders go in a collapsed "Done" list. (`5175539`)
  - **`#/revisions`:** parts whose revision went up ("rev 3 → 4"), with the fields that changed, who and when, and **every** open work order that has the part (⚠ on all of them: red when it's already being made, made or bought, amber otherwise). (`aabbda4`)
  - **`#/stale`:** work orders whose parts changed since the order was made: "rev 2 → 4 · qty 4 → 6", "added to the BOM", "removed from the BOM". Exact for work orders made from now on; older ones are greyed as "maybe changed". (`904f113`)
  - **`#/files`:** the Drive overview: counts and sizes of images, STL and Parasolid; missing files; parts that want a file but never got one; the largest files; and **files no record uses**, deletable exactly like `#/orphans` (per file or in bulk, to the Drive trash). (`ce8655f`)
  - **`#/server`:** version, uptime, database / Drive / Render status, the last Drive sorts and cleanups, wrong admin secrets, and response times per route. (`0b5d58a`)
  - **`#/tele` additions:** extension versions in use (who's on an old one), Publish BOM success rate and time, and the most common errors. (`a0873ea`)
- The sidebar scrolls when its items don't fit a short screen. (`904f113`)

## Not tested yet

- Every page was checked with made-up server replies only, not the real server.
