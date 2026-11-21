# Server: next version

**Unreleased.** `5a7d06e` was pushed on 2026-11-21 15:48. Render must still be redeployed by hand.

## Before you deploy

- **Redeploy on Render before handing out the next extension.** Until then, both new fields are dropped without an error. The extension notices this after Publish BOM and says the server needs updating.

## Changes

- **Parts can remember "Not the same part"** for the extension's combined copy rows. (`5a7d06e`)
  - `keepSeparate`: someone marked this part as not the same as its look-alike copies. It's combined only with other parts marked the same way, never with unmarked ones.
  - `copyPartIDs`: the other copies a record stands for, so a marked row is rebuilt correctly after a reload.

## Not tested yet

- Not run against the real database. The server type-checks.
