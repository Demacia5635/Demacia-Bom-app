# Extension: next version

**Not built yet.** Commits `ef4a751`, `b91e47c`, `f477d57`, `16e3963`, `7be21f1` and `3821d89` were pushed by 2026-11-21 15:48, and `1039c40` on 16:27. `3178eb4` is committed but not pushed yet. Replaces [v3.0.0](../3.0.0/v3.0.0.md).

(`ef4a751` was first logged as 3.1.0. That version was never built, so it's part of the next version.)

## Before handing it out

- **Publish your edits before updating.** The first time each BOM opens in this version it's loaded fresh from Onshape, and unpublished edits saved in the browser are lost. (`f477d57`, `1039c40`)

## New

- **Same name and catalog number = the same part, and the panel asks before combining.** This follows the team mentor's rule: two items with the same name and catalog number are the same part, even if they were modeled separately (e.g. 4 legs drawn one by one instead of one leg inserted 4 times). Two items with the same catalog number but different names are a mistake, fixed in Onshape. Nothing is combined on its own. (`1039c40`)
  - A **notice above the table** lists catalog numbers used by more than one item.
    - **Same name:** a **Combine** button (and **Combine all** for every such group). The items become one row with the total quantity.
    - **Different names:** the Catalog No. cells turn red (this blocks a work order) and name the other items, e.g. "0400-1104 is also used by "X". Give each its own catalog number in Onshape, or press Combine anyway". **Combine anyway** combines them regardless.
    - **An assembly among them:** it's only flagged. Fix it in Onshape.
  - **Publish BOM** lists the same groups, plus catalog numbers this assembly uses that are already used in the database by something outside it. When it lists a group or a warning, you have to tick that you understand, and the button becomes **Combine and publish**, which combines the groups first. A clean publish needs no tick. If the database list can't be loaded, the dialog says so and still lets you publish.
  - **A combined row shows "×4 copies"** over the top-left corner of its picture. It's a normal part row: it doesn't open to list the copies. (`16e3963`, `3178eb4`)
  - A combined part is saved as one record, under every parent that uses it. That's the record of a copy that was already saved, otherwise the same copy on every load. Its STL / Parasolid come from that copy, and your edits are written to every copy in Onshape. The other copies' old records stay in the database, unused.
  - Never grouped: empty or placeholder catalog numbers ("-", "?", "TBD", "N/A", "none"…), default "Part N" names, and bought items (Standard Content, vendor, marked standard). Spaces around names and numbers, and upper/lower case, don't matter.
- **Light mode.** The BOM header has the same theme button as the website: 🌙 while light (click for dark), ☀️ while dark (click for light). Until you first click it, the panel follows your browser's or computer's colour scheme, so **if yours is set to light, the panel turns light after updating.** Click 🌙 to make it dark; the panel then remembers your choice. Dark mode looks exactly as before. (`7be21f1`, `3821d89`)

## Removed

- The automatic shape-based combining from `ef4a751`, **Not the same part** from `b91e47c`, and the list of copies under a combined row (all pushed, never in a built extension). The modeler fixes a wrong name or catalog number in Onshape instead. (`1039c40`, `3178eb4`)

## Not tested yet

- Not run in the real panel in Onshape or against the live database: the notice, Combine, the red catalog-number problems, and the Publish dialog's database check (the full parts list may be slow to load). The grouping and combining rules, the dialog and the notice passed scripted checks.
- Light mode hasn't been opened in Chrome or Firefox at all, so some parts of the panel may still be dark.
