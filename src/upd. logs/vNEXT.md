# Website: next version

**Unreleased.** On branch `fix/web`, not on `MASTER` yet.

## Before you deploy

- Needs the server's next version (admin check route) for `#/admin` to unlock.

## New

- **`#/orphans`: bulk delete.** A "Bulk delete" button shows checkboxes on the cards and a bar with "Delete all shown (N)…", "Delete selected (N)…" and Cancel. Only parts the filter shows can be selected. The confirm dialog lists the parts and how many files go to the Drive trash; the result lists every part (deleted, not deleted with the reason, or not tried). More than 200 parts go in batches of 200. The per-card Delete stays. (`b98db2a`)
- **Admin pages in the sidebar.** On the hidden page `#/admin`, enter the admin secret once: that browser then shows an "Admin" section at the bottom of the sidebar with Onshape Footprint (`#/tele`), Data Health (`#/health`), Parts in No Assembly (`#/orphans`) and Admin (to lock it again). The browser remembers only that it's unlocked, never the secret; deleting still asks for the secret once per tab. (`802ff5f`)

## Not tested yet

- Both were checked with made-up server replies, not the real server.
