# Extension: next version

**Not built yet.** Commits `ef4a751`, `b91e47c`, `f477d57`, `16e3963`, `7be21f1` and `3821d89` were pushed by 2026-11-21 15:48, and `1039c40` on 16:27. `3178eb4` and `b92855e` are committed but not pushed yet. Replaces [v3.0.0](../3.0.0/v3.0.0.md).

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
  - A combined row is a normal part row with the total quantity. It doesn't open to list the copies. (`3178eb4`, `b92855e`)
  - A combined part is saved as one record, under every parent that uses it. That's the record of a copy that was already saved, otherwise the same copy on every load. Its STL / Parasolid come from that copy, and your edits are written to every copy in Onshape. The other copies' old records stay in the database, unused.
  - Never grouped: empty or placeholder catalog numbers ("-", "?", "TBD", "N/A", "none"…), default "Part N" names, and bought items (Standard Content, vendor, marked standard). Spaces around names and numbers, and upper/lower case, don't matter.
- **Light mode.** The BOM header has the same theme button as the website: 🌙 while light (click for dark), ☀️ while dark (click for light). Until you first click it, the panel follows your browser's or computer's colour scheme, so **if yours is set to light, the panel turns light after updating.** Click 🌙 to make it dark; the panel then remembers your choice. Dark mode looks exactly as before. (`7be21f1`, `3821d89`)

## Fixes from the code-review checklist (on branch `fix/ext`, not on MASTER yet)

- **One failed request no longer breaks the whole Refresh BOM.** A request to Onshape or the server that failed once is tried again the next time it's needed, instead of failing every later part of the load and every sub-assembly you open afterwards. (B12, `1b65342`)
- **A failed Publish BOM tells you right away, in the Publish dialog, what went wrong and what to do.** Before, the error was hidden until the dialog closed, and was a raw message like "Failed to fetch". Now it names the step and item that failed, the likely cause (the BOM server or Onshape can't be reached, no permission in Onshape, an item was deleted or changed, too many requests, someone saved the same item at the same moment, an invalid value) and the next step (retry, Refresh BOM, check your Onshape access…), with the raw message as details. It's cleared when the dialog opens again or the BOM reloads. (B14, `2c1548c`, `f4c7249`)
- **Every publish failure stays inside the Publish dialog,** including "someone published this again after your copy was loaded" and "items inside weren't saved", in the same plain words. (`24b2f35`)
- **A saved copy must be refreshed before it can be published.** When the panel shows a copy saved in the browser ("Saved copy from 3 days ago"), Publish BOM is disabled and the dialog says to press Refresh BOM first, because Onshape may have changed since. If the copy has unpublished edits, it warns that they'll be lost on Refresh. Before, an old copy could be published over newer data. (B13, `ab6c8f1`)
- On Firefox, a BOM sidebar opened from the sidebar menu follows the tab you switch to, instead of staying on the first one. (B11, `ebc3275`)
- Opening or closing rows while Publish BOM runs is no longer undone when it finishes. (E1, `e133abe`)
- **The Default engineer in the Publish dialog only applies to items that aren't in the database yet.** New items get your Onshape name (shown greyed in their empty Engineer cell), or whatever you type in the dialog, or nothing if you clear it. Items already saved keep their saved engineer, even an empty one, and a saved made part with no engineer is now flagged for work orders. (E4, `bbe3152`)
- **Refresh BOM asks before throwing away unpublished edits in a dialog inside the panel** ("Discard unpublished edits?", listing the items), instead of the browser's pop-up, which Firefox's sidebar may block. (E5, `ea62f6d`)
- **On Firefox, the BOM button on the Onshape page tells you to click the toolbar icon instead,** since Firefox doesn't let it open the sidebar. Before, it did nothing. (B10, `b04ea8d`)
- On Chrome, the toolbar icon and BOM button open and close the panel reliably, also after it has been open a while, and a panel opened while switching tabs stays on the right tab. (E7, `8b2aac5`)
- Unticking "Show size" or closing the panel stops the size requests to Onshape. (E8, `4895894`)
- If a Refresh BOM fails halfway, the header keeps describing the BOM still shown. (E6, `52892d5`)
- Assembly names no longer start with a stray space, and record IDs no longer end in "_undefined" when Onshape gives no BOM id. (E2, E3: `516348a`, `dac3361`)

## Removed

- The automatic shape-based combining from `ef4a751`, **Not the same part** from `b91e47c`, and the list of copies and "×N copies" label on a combined row (all pushed, never in a built extension). The modeler fixes a wrong name or catalog number in Onshape instead. (`1039c40`, `3178eb4`, `b92855e`)

## Not tested yet

- The checklist fixes haven't been run in the real extension, and no failure was forced to see the messages. The Firefox fixes need Firefox. On Chrome, check that the icon and BOM button still open and close the panel, also after it has been open for over a minute.
- Not run in the real panel in Onshape or against the live database: the notice, Combine, the red catalog-number problems, and the Publish dialog's database check (the full parts list may be slow to load). The grouping and combining rules, the dialog and the notice passed scripted checks.
- Light mode hasn't been opened in Chrome or Firefox at all, so some parts of the panel may still be dark.
