# Extension: next version

**Unreleased.** On branch `fix/ext`, not on `MASTER` yet.

## Changes

- **Usage statistics say why something failed.** Publish and Refresh BOM now report how they went, including the failures the panel shows without crashing (a newer copy published, items not saved, the server's refusals). Each event carries a short error code (e.g. `CATALOG_NUMBER_TAKEN`, `HTTP_500`, `SERVER_UNREACHABLE`, `ONSHAPE_429`, `NEWER_PUBLISHED`), how many items a publish handled, non-fatal problems, and the browser. These feed `#/tele`'s new "most common errors" list. In Firefox they're still sent only when usage statistics are allowed. (`761c3ed`)

- Revision shows "—" for vendor parts too, like the server and website. (`59925a5`)

## Not tested yet

- End to end with the real server: after deploying, one failed publish (e.g. a catalog-number clash) should show its code on `#/tele`.
