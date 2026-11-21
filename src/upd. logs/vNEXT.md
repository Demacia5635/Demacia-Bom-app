# Website: next version

**Unreleased.** The commits below are on branch `fix/web`, not on `MASTER` yet. They go in with the next version once the branch is merged.

## Fixes (from the code-review checklist)

- **Part Portal's Download STL and Download Parasolid buttons work.** They always failed before. A button is greyed out when that file doesn't exist, and a failed download shows a message instead of doing nothing. (B1, `5c12c17`)
- **New work orders get the right quantities.** Each part's total used to be its quantity in one parent only: a sub-assembly's own quantity wasn't multiplied in, a sub-assembly used twice was counted once, and a part used in several sub-assemblies got a separate line for each. Now each part gets one line with its full total, the same numbers the work-order page shows. Existing work orders aren't changed. (B2, `2d4e822`)
- **Clicking a part's picture on a work order opens the image viewer again after the Avatar column has been moved,** and on rows of a merged CNC job. (B5, `22fe2fb`)
- **A failed save on a work order no longer loses your change.** It's sent again with your next edit of that part, as on the BOM page. The "Couldn't save" banner stays as it was. (B6, `9d827b1`)
- **Saving in Part Portal no longer overwrites changes the extension published while the dialog was open.** Only the fields you changed are sent, and nothing is sent if you changed nothing. (B7, `1ebe56f`)
- The clear buttons in the search boxes on the Search Parts and Work Orders pages change colour on hover again. (B17, `6b8be3c`)
- **The work-order PDF shows the "Assembly:" line again.** (B18, `2a467a6`)
- The BOM page's **Open CAD** button is greyed out when the part's Onshape link is incomplete, instead of opening a broken page. Part Portal's **Open Onshape** is greyed out when there's no link. (B19, `797038d`; B20, `ae281f3`)

## Not tested yet

- No work order was created with the fix, since that writes to the database. No actual download was tried in a browser (it needs the server with Drive access). Type check and build pass.
