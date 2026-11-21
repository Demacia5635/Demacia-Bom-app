# Website: next version

**Unreleased.** The commits below are on branch `fix/web`, not on `MASTER` yet. They go in with the next version once the branch is merged.

## Fixes (from the code-review checklist)

- **Part Portal's Download STL and Download Parasolid buttons work.** They always failed before. A button is greyed out when that file doesn't exist, and a failed download shows a message instead of doing nothing. (B1, `5c12c17`)
- The Parasolid download is now named `<part>.x_t`, the standard extension that CAD programs open (it was `.parasolid`). (`371155d`)
- **New work orders get the right quantities.** Each part's total used to be its quantity in one parent only: a sub-assembly's own quantity wasn't multiplied in, a sub-assembly used twice was counted once, and a part used in several sub-assemblies got a separate line for each. Now each part gets one line with its full total, the same numbers the work-order page shows. Existing work orders aren't changed. (B2, `2d4e822`)
- **A sub-assembly bought whole (marked standard, or with a vendor) is one "Purchased" line in a work order.** Its insides aren't listed, and they aren't checked for material or engineer, which used to block creating the work order. This applies on the work-order page too, so **existing work orders show such a sub-assembly as one Purchased line instead of its inner parts** (any progress recorded on those inner parts is no longer shown). (B8, `278ec81`)
- **A work order follows its assembly's current BOM, and says so:** a grey note under the title reads "Parts and quantities follow the assembly's current BOM: publishing it again updates this work order." New work orders no longer store quantities nobody used, and merging into or removing from a CNC job drops parts that are no longer in the BOM. (B9, `f727d21`)
- A work order no longer flashes an empty table before it loads, and one without a BOM says so instead of showing nothing. (W5, `9bb667f`)
- The "Create work order" form can't be closed by clicking outside it while it's creating. (W6, `e9642b7`)
- If "Show Part Data" can't load a part, you're told, instead of nothing happening. (W7, `afca27b`)
- An empty BOMs list says "No BOMs published yet" instead of showing a blank table. (W8, `30b9651`)
- If the work-order list fails to load, you see the real error, not a misleading second one. (W9, `6f9ecc0`)
- A mistyped address goes to the Home page instead of quietly showing it under the wrong address. (W11, `0bf51de`)
- **The privacy policy now describes the extension's usage statistics** (what's recorded, that records are deleted after about 6 months, where they can be seen) and what's kept in the browser (BOM copies, image cache, display settings). (S3, `7ca8d73`)
- The sidebar's buttons can't be reached with the Tab key while it's closed. (W12, `ee0bb64`)
- A file download can no longer be cancelled by the browser right after it starts. (W15, `028af0c`)
- A download that gets an unexpected answer from the server shows an error instead of saving an empty or broken file. (W16, `78daf59`)
- **Clicking a part's picture on a work order opens the image viewer again after the Avatar column has been moved,** and on rows of a merged CNC job. (B5, `22fe2fb`)
- **A failed save on a work order no longer loses your change.** It's sent again with your next edit of that part, as on the BOM page. The "Couldn't save" banner stays as it was. (B6, `9d827b1`)
- **Saving in Part Portal no longer overwrites changes the extension published while the dialog was open.** Only the fields you changed are sent, and nothing is sent if you changed nothing. (B7, `1ebe56f`)
- On bought parts (vendor, Standard Content or marked standard), Part Portal's **Save / Upsert Part** button is greyed out, with a note that they're edited in the extension. Before, it could be clicked and showed "Saved ✓" without saving anything. (B7, `4f3ba23`)
- The clear buttons in the search boxes on the Search Parts and Work Orders pages change colour on hover again. (B17, `6b8be3c`)
- **The work-order PDF shows the "Assembly:" line again.** (B18, `2a467a6`)
- The BOM page's **Open CAD** button is greyed out when the part's Onshape link is incomplete, instead of opening a broken page. (B19, `797038d`)
- Part Portal's **Open Onshape** is greyed out when there's no link. (B20, `ae281f3`)
- **Part Portal has one Open Onshape button,** next to the STL and Parasolid downloads. The duplicate "Open CAD Link ↗" next to Save is gone. (B20, `cc1cfe0`)
- **The STL / Parasolid downloads on the BOM and work-order pages use the same server as the rest of the site,** and a failed download shows a message instead of doing nothing. (B3, `bcb19fe`)
- **Editing a work-order cell no longer moves rows around.** A part that leaves its CNC job goes back to its place in the BOM. (B24, `378a548`)
- **Typing in a CNC job's Links cell no longer flickers back to older text** when a save answer arrives late. (B23, `968f448`)
- **Right-clicking a CNC job's shared Links cell acts on the part on that line,** not always on the job's first part. ("Remove from CNC job" used to remove the wrong part.) (B25, `f2d0a45`)
- **The BOMs page loads at once,** without one extra request per BOM and the "Structuring assembly tree..." wait. (P1, `4886ab3`)
- Telemetry page: switching the date range quickly can't show an older range's data, and a selected user who isn't in the new range falls back to all users. (W1, W2: `dc24aa4`, `cbacae5`)
- **Sub-assembly rows on the BOM page are read-only,** like bought items. Edits to them showed on screen but were never saved; sub-assemblies are edited in the extension. (B4, `fde49bd`)
- **After saving in Part Portal, the list or table behind it shows the new values** right away, instead of the old ones until a reload. (W4, `79799f3`)
- An internal fix to how BOM-page edits are kept in memory. (W3, `cafabff`)

## Tables (also in the extension panel)

- **Right-click works normally on table rows again,** including copy and paste inside a cell. The BOM and work-order pages keep their own "Show Part Data" menu. (B15, `d1406d3`)
- Dragging a column edge to resize can't get stuck following the mouse any more. (B16, `7526b07`)
- The column menu (Move Left / Move Right) closes when you click anywhere outside it. (W10, `4443c0a`)
- A row's picture never briefly shows the previous picture when the row changes. (W14, `5c84dcc`)

## For developers

- `npm run build` (the website) stops with an error when `VITE_CLIENT_URL` isn't set, instead of quietly using the production address. The GitHub Pages deploy already sets it. The extension build is unchanged. (C9, `9961bb6`)

## Decided, not done

- Old work orders made before extension 3.2.0 keep the saved status and links of hidden copies of a part hidden; re-enter them on the combined row (B22, the user's choice).
- Restricting who can open the statistics page (/tele) waits for the sign-in project.

## Known problems

- On a work order, "Show Part Data" on a bought sub-assembly that has no part record says it "isn't saved in the database yet".

## Not tested yet

- No work order was created with the fix, since that writes to the database. No actual download was tried in a browser (it needs the server with Drive access). Type check and build pass.
