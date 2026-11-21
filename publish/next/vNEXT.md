# Extension: next version

**Not built yet.** Commits `ef4a751`, `b91e47c`, `f477d57`, `16e3963`, `7be21f1` and `3821d89`, all pushed by 2026-11-21 15:48. Replaces [v3.0.0](../3.0.0/v3.0.0.md).

(`ef4a751` was first logged as 3.1.0. That version was never built, so it's part of the next version.)

## Before handing it out

- **Redeploy the server on Render** (server, next version). Until then, "Not the same part" isn't saved. Publish BOM says the server needs updating instead of quietly forgetting it.

## Changes

- **Light mode.** The BOM header has the same theme button as the website: 🌙 while light (click for dark), ☀️ while dark (click for light). Until you first click it, the panel follows your browser's or computer's colour scheme, so **if yours is set to light, the panel turns light after updating.** Click 🌙 to make it dark; the panel then remembers your choice. Dark mode looks exactly as before. (`7be21f1`, `3821d89`)
- **Parts modeled several times in one Part Studio are combined into one row.** Copies drawn one by one (e.g. 4 legs drawn separately instead of one leg inserted 4 times) are separate parts to Onshape, so its BOM listed each with quantity 1. The panel now shows them as one row with the total quantity. (`ef4a751`)
  - Copies must be in the same Part Studio and configuration, with the same shape (volume, surface area and moments of inertia), the same material, and the same name. A part still called "Part N" counts as the same name. If both have part numbers, those must match too. Colour doesn't count.
  - Publish BOM writes your edits to every copy in Onshape, and saves one record with the total quantity.
  - If Onshape's shape data can't be read, nothing is combined and the BOM looks as before.
  - **A combined row shows "×4 copies"** over the top-left corner of its picture. (`16e3963`)
  - **It opens to list each copy,** read-only, with its own quantity and picture. Its open button is a round blue ▸ ("Show the 4 copies of this part"), not the grey ▶ of a sub-assembly. (`b91e47c`, `16e3963`)
  - **Fix a wrong combination:** right-click a copy and choose **Not the same part: list it separately**. It moves to its own row, and other copies you mark the same way join that row. Right-click a marked row (or a copy in it) and choose **Same part after all** to undo. Both are edits, saved on Publish BOM. (`b91e47c`)
  - **Expand all** now opens sub-assemblies only, not combined rows.
  - BOMs saved in the browser by an older version are loaded fresh from Onshape once, so combined rows get their copies. **Unpublished edits saved in the browser are lost then:** publish them before updating the extension. (`f477d57`)

## Known problems

- A mirrored left/right pair with the same name and material is combined into one row. Use **Not the same part** on the copies of one side (or give the two sides different names).
- After a reload, **Same part after all** combines the rows only after the next Publish BOM and Refresh BOM.
- If renaming a copy changes which copy a marked row shows, an old record can keep its mark.
- Assemblies published before this listed each copy as its own part. After the next Publish BOM, the BOM saves one part with the total quantity. The other copies' old records stay in the database but are no longer used.

## Not tested yet

- Light mode hasn't been opened in Chrome or Firefox at all, so some parts of the panel may still be dark.
- Not run against real Onshape, including the full Publish → Refresh round trip with the redeployed server. The matching, split and undo rules passed scripted checks, and the extension builds.
- It isn't known yet whether Onshape gives the shape data for parts without a material (they show mass 0). If it doesn't, those parts aren't combined, the same as before.
