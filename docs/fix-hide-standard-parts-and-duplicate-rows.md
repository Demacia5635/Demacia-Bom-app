# Fix: "Hide standard parts" left parts visible, and rows were duplicated

*2026-11-15. Commits `ccbbacc` and `f73f99d` on MASTER (local, not pushed yet).*

## What you saw

In the extension's BOM panel, with **Hide standard parts (23)** ticked:

- Greyed-out standard parts were still listed. Examples: the *Hex socket head cap screw M5x0.80 x 22* at the top, the two *M4x0.70 x 16* screws under 2714-1200, and the *Real bearing* under 2714-1110.
- *magnetic sensor* showed **5 times** under 2714-1200, but the whole model has only **2**.

There were two separate causes.

## Cause 1: duplicate row IDs confused the table (the main bug)

Each row in the table has an ID. For a part it's built from its Onshape document, element and part ID, so a part used in several places gets **the same ID on every row**. Your model has several of these: the same screw in several sub-assemblies, the bearing, and the magnetic sensors.

The table (`src/components/Table.tsx`) gave each row's `key` to React, the library that draws the page, and used the row ID as that key. React requires keys to be unique. When two rows share one, React loses track of which on-screen row belongs to which data row. Every time the table redraws (ticking a checkbox, expanding, sorting), it can:

- **leave old rows on screen** that should have been removed. That's why hidden screws stayed visible.
- **add extra copies.** That's why 2 sensors became 5, and the number keeps growing the more you click.

**Proof:** I rebuilt your situation in a test that runs the real table in a simulated browser: two sub-assemblies, each with the same screw and the same sensor. With the old code, each toggle of "hide standard" added rows (6 → 9 → 12 → 15), hidden screws stayed, and React logged 11 duplicate-key warnings. After two toggles the test showed exactly what your screenshot shows: 5 sensors.

**Fix (`ccbbacc`):** the table now gives React a key that's always unique: the row's parent + the row's ID, plus a counter if the same part appears twice under the same parent. The row ID itself is unchanged. It's also the database ID, and changing it is a separate, bigger planned change (#5). In the same test, every toggle now shows the correct rows, with no warnings. Collapsing and expanding a sub-assembly also stays correct.

The fix is in the shared table, so the website's BOM and work-order tables are protected too.

## Cause 2: vendor parts weren't counted as "standard"

The table greys out three kinds of bought parts:
1. Onshape **Standard Content** (the built-in screws and nuts),
2. **vendor parts**: parts with a vendor set, e.g. screws or bearings from a supplier's library, which aren't Onshape Standard Content,
3. parts you **marked standard** in the panel.

But "Hide standard parts" and its count only checked kinds 1 and 3. A vendor screw or bearing was greyed out but never hidden.

**Fix (`f73f99d`):** the checkbox and its count now use exactly the same rule as the greyed-out rows. The narrower rule that Publish BOM uses to decide which files to export is unchanged. Expect the number in "Hide standard parts (N)" to go **up** after this, because vendor parts are now counted.

## What's still worth checking

I couldn't open the real panel on Onshape, so please check these when you next use it:

1. **Rebuild and reload the extension** (`npm run build:extension`, then reload it in Chrome) and open the assembly from the screenshots.
2. Tick and untick **Hide standard parts** several times: all greyed parts should disappear and come back, and nothing should multiply.
3. **Count the magnetic sensors.** If you still see more than 2, it's no longer the display: the BOM Onshape sends would list it more than once. That would point to issue #5 (configurations are missing from row IDs), which the extension session (e6) is preparing to fix.

## Related, not changed here

- **Not fixed, and it affects quantities: a sub-assembly used under two different parents is only counted under the first.** While building the tree, the panel skips a sub-assembly it has already loaded (`AssemblyBomPage.tsx`, `expandTree`, the `visited` check), so its second use gets no row. Publish BOM saves each assembly's list of children from those rows, so the second parent's saved BOM doesn't include that sub-assembly. Work orders add up quantities from the saved BOMs, so **every part inside that sub-assembly is under-counted** for its second use. (Using it several times under the *same* parent is fine: Onshape sends that as one row with a quantity.) I didn't change this here. It changes what Publish writes to the database and is tied to the row-ID change (#5) that the extension session (e6) is preparing, so it should be fixed together with that.
- **Both fixes are committed but not pushed.** The website and the extension update only after a push, and a rebuild for the extension. (The Render server fix `0667cec` is already pushed; Render deploys by hand, so the server still needs a manual redeploy if that hasn't been done.)
