# Server: next version

**Unreleased.** The commits below are on branch `fix/serv`, not on `MASTER` yet. They go in with the next version once the branch is merged.

## Fixes (from the code-review checklist)

- **Merging parts into a CNC job works for parts added to the BOM after the work order was made.** Before, it failed with "Some of those parts aren't in this work order". The server now adds those parts to the work order, with the same defaults as a part's first edit. (B21, `e51396d`)
- An edit to a work-order part with badly formed data now gets a clear "400" error instead of a server error. (D1, `395786d`)
- A website address listed in the server's allowed origins with a trailing "/" is no longer let through by one check and refused by the other. (S7, `c642a65`)
- The client secret is compared in constant time, so response timing can't be used to guess it. No visible change. (S5, `d69e691`)

## Before you deploy

- Redeploy the server on Render by hand after merging.

## Not tested yet

- Not run against a real database (no local MongoDB was available). Type-checked only.
