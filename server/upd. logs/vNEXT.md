# Server: next version

**Unreleased.** The commits below are on branch `fix/serv`, not on `MASTER` yet. They go in with the next version once the branch is merged.

## Fixes (from the code-review checklist)

- **Merging parts into a CNC job works for parts added to the BOM after the work order was made.** Before, it failed with "Some of those parts aren't in this work order". The server now adds those parts to the work order, with the same defaults as a part's first edit. (B21, `e51396d`)
- An edit to a work-order part with badly formed data now gets a clear "400" error instead of a server error. (D1, `395786d`)
- A website address listed in the server's allowed origins with a trailing "/" is no longer let through by one check and refused by the other. (S7, `c642a65`)
- The client secret is compared in constant time, so response timing can't be used to guess it. No visible change. (S5, `d69e691`)
- The deployed server no longer accepts requests from a website running on a developer's computer (localhost); only a server run locally does. **It only takes effect once `NODE_ENV=production` is added to the server's environment variables on Render; nothing sets it today.** A local website talks to a local server, so normal development isn't affected. (S6, `42980ed`)
- **Drive uploads accept only pictures (png, jpg, webp), STL and Parasolid (x_t, x_b), up to 20 MB.** Any other type is refused (415) before the file is read, and bigger files get 413. The extension's normal uploads all pass. (S2, `4273e89`)
- Drive file requests with an ID that can't be a Drive ID are refused (400) without asking Drive. (S4, `1505b2d`)
- A CNC job request is limited to 500 parts and 4000 characters of links. (D10, `85cda05`)
- If the database address is missing, the server now says "MONGODB_URI is not set" instead of "Failed to connect to .env". (D7, `830552b`)
- An error after a reply was already sent no longer causes a second, broken reply. (D6, `d8f0254`)
- The server accepts saves of up to 2 MB (was 100 KB), so publishing a very large BOM or sending a big batch of usage events no longer fails with "too large". (D5, `e796f25`)

## Before you deploy

- Redeploy the server on Render by hand after merging.
- **A part file bigger than 20 MB can no longer be uploaded** (it was 50 MB). A very large Parasolid would now fail to publish.

## Decided, not done

- Sign-in for the API (S1): planned as a separate project.
- Package changes in the root `package.json` (C1, C2, C3, C5, and rate limiting): declined for now.

## Not tested yet

- Not run against a real database (no local MongoDB was available). Type-checked only.
