# Plan: moving from the Onshape-tab app to the Chrome extension

The Chrome extension shows the same BOM page as the old app, in Chrome's side panel next to the Onshape tab. It talks to Onshape with the user's browser login instead of stored Onshape API keys, so its Onshape calls don't count against the yearly limit of 2,500 API requests.

The extension uses the same page code as the old app, so its BOM features already match. What's left is to deploy it, test the steps that write data, hand it to the team, and then remove the old app and the API keys.

## Where things stand

| Item | State |
|---|---|
| Extension steps 0, 1, 2, 3, 5 | Done, on branch `chrome-extension` (4 commits, not pushed) |
| Step 4: publish and edit from the panel | Built, not tested |
| Server change: part lookup reads only MongoDB, never Onshape | On `chrome-extension`, not deployed |
| Removal of the `debug-keys` route | On branch `remove-debug-keys`, not committed |

---

## Phase 0: Security fix (today)

`GET /api/auth/debug-keys?username=<name>` needs no login and returns that user's Onshape API keys in readable form. Anyone who knows the server's address and a username can call it.

| Task | Who |
|---|---|
| Commit `remove-debug-keys`, review, merge, and deploy to Render | You + server person |
| Each user deletes their Onshape API key in Onshape (Developer → API keys), assuming it may already have been read | Each user |

**Done when:** `GET /api/auth/debug-keys` returns 404 on Render.

## Phase 1: Make the server ready for the extension

| Task | Who |
|---|---|
| Push `chrome-extension` and open a pull request; review the two server files (`partController.ts`, `partRoutes.ts`) | You + server person |
| Deploy it. **Add** the extension's address to the existing `ALLOWED_ORIGINS` value on Render, keeping what's there: `chrome-extension://ijejpoheiljnajdnanepbkhiegidelkl` | Server person |
| Check whether Render has `ONSHAPE_ACCESS_KEY` / `ONSHAPE_SECRET_KEY` set; if so, requests from users who saved no keys use that account's quota | Server person |
| Point `.env.local` (`VITE_CLIENT_URL`) at the Render URL, rebuild the extension, and reload it in Chrome | You |

**Done when:** the panel loads a BOM tree with the local server stopped.

## Phase 2: Test publish and edit (step 4)

These tests write to the **production** database and Drive. Use one test part and one small test sub-assembly, and clean up afterwards.

| Test | What to check |
|---|---|
| Edit a property in the panel | The new value shows in Onshape's own properties |
| Publish one part | MongoDB record created; Drive has its thumbnail, STL and Parasolid |
| Publish one sub-assembly | MongoDB record and thumbnail created |
| Repeat both on a version (a URL with `/v/`) | Same results |
| Watch the server logs during the tests | No calls to `/onshape/*`, which would mean API keys were used |
| Clean up | Delete only the test records (their IDs start with the test document's ID) and their Drive files |

**Done when:** every test passes and Onshape still shows 0 API requests used.

## Phase 3: Hand it to the team

| Task | Notes |
|---|---|
| Choose how people install it | **Load unpacked** from a zip: free and keeps the current extension ID, but every update means reinstalling by hand. **Chrome Web Store, unlisted**: one-time $5 developer fee and automatic updates, but the Store assigns a new extension ID, which must also be added to `ALLOWED_ORIGINS`. |
| Write a one-page install guide | Install, pin the icon, open an assembly in Onshape, click "☰ BOM" |
| Check that links from the panel to the public site (BOM details, work orders) work | They should open in a new browser tab |
| Run both side by side for 1–2 weeks | The team uses the extension; the old app stays available as a fallback |
| Collect feedback and fix blockers | Mainly display and missing actions |

**Done when:** the team uses only the extension for day-to-day work.

## Phase 4: Make the public website independent of Onshape

The public site reads MongoDB and Drive. It only calls Onshape, through the server with API keys, when a published item has no thumbnail, STL or Parasolid in Drive.

| Task | Who |
|---|---|
| Add a "fill in missing files" action to the extension: for already-published parts without Drive files, fetch them with the user's Onshape login and upload them to Drive | Me |
| Run it once over the existing records | You |
| On the site, replace the Onshape fallbacks with a placeholder image and an "Open in Onshape" link (`BomTable`, `MainBomDataUI`, `BomDetailsPage`, `WorkOrderTable`, `WorkOrderDataUI`, `WorkOrderDetailsPage`, `SearchPartsPage`, `PartPortal`, `BomColumns`, `WorkOrderColumns`) | Me + server person |

**Done when:** the site shows every image and download without calling `/api/onshape/*`.

## Phase 5: Retire the old app

| Task | Who |
|---|---|
| Remove the old app's registration from the Onshape Developer Portal, so its tab no longer appears in Onshape | Whoever owns the Onshape app |
| Remove the `/onshape` route from the web app (`App.tsx`), along with `src/util/OnshapeExtension.tsx` and the `/onshape` handling in the sidebar and sign-up pages | Me |
| Remove the `isChromeExtension()` branches; the extension code path becomes the only one | Me |

## Phase 6: Remove the Onshape API keys

| Task | Who |
|---|---|
| Delete the server's `/api/onshape/*` routes, `onshapeController`, `onshapeService`, and the key-loading code (`src/util/sec/onshapeKeys.ts`, `userKeys.ts`, `encryption.ts`) | Me + server person |
| Delete the background Drive uploads in `partController.ts`, which call Onshape and probably always fail | Me + server person |
| Remove the key fields from sign-up and delete the API-keys tutorial page | Me |
| Clear `onshapeAccessKey` and `onshapeSecretKey` from all user records in MongoDB | Server person |
| Remove `MASTER_ENCRYPTION_KEY` and any fallback Onshape keys from Render | Server person |
| Remove the `VITE_ONSHAPE_*` lines from `.github/deploy.yml` | Me |

**Done when:** no Onshape API keys are stored or used anywhere.

---

## Decisions needed

1. **How to install** (Phase 3): load unpacked, or the Chrome Web Store unlisted.
2. **The Demacia login after Phase 6:** the login only told the server whose API keys to use. Its "protection", the client secret, is built into the public JavaScript, so anyone can read it. Without the keys, decide whether the site needs a real login (for example Google sign-in for team members) or should stay open to read.
3. **Who owns the Onshape app registration** (Phase 5).
4. **Test cleanup:** who deletes the Phase 2 test records and Drive files, and when.
