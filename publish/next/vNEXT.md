# Extension: next version

**Unreleased.** On branch `fix/ext` (`33845f5`–`cc62bf3`). The user releases this version separately; `fix/ext` is not merged into `MASTER` for it.

## Before handing it out

- **The extension asks for one new permission: notifications** (for the "publish finished" message). Chrome shows it when the new version is loaded.
- Redeploy the server first if you want "who saved it" recorded: the extension now sends the Onshape user name with every save (an older server just ignores it).

## New

- **Right-click a row** for a menu (Shift+right-click keeps the browser's menu):
  - **💡 Suggested fix** on a problem, like VS Code: e.g. "Use 2714-1003 (from the name)" for a catalog number, "Use 6061 aluminium (used by 12 parts here)" for a missing material, the Default engineer for a missing engineer. Fixes can be undone. (QE11, `91dab42`)
  - **Open on the website ↗**: a part opens its card in Search Parts, an assembly its BOM page. Only for items already in the database. (QE17, `91dab42`)
  - **Copy Onshape link.** (QE18, `91dab42`)
- **Excel-style editing in the table:** drag across cells or Shift-click to select a range; Ctrl+C / Ctrl+V copy and paste it (also to and from Excel); Ctrl+D fills down; Delete clears the selected text cells. When the selection covers 2 or more rows, a bar at the bottom sets Material, Engineer or the STL / Parasolid ticks for all of them; bought rows are skipped. Each action is one undo step. (Ctrl+click to add separate rows isn't supported: the selection is one rectangle.) (QE2, QE3: `bf18cfa`, `462001d`, `cc62bf3`)
- **Undo / redo** with Ctrl+Z / Ctrl+Y (or the ↶ ↷ buttons) for cell edits, standard marks and combines, up to 50 steps, until a refresh or publish. (QE4, `aa11ead`)
- **↺ Revert** on an edited row puts it back to its saved values; **↺ Revert all** in the toolbar (asks first if more than 5 items). Both can be undone. (QE1, `49a7d2e`)
- **The Publish dialog lists the changes:** "Changes (N)", one line per edited cell, "Item · Column: old → new". (QE5, `e0ba2de`)
- **Desktop notification** when a publish that took over 30 s finishes or fails while you're not looking at the panel. (QE6, `fc2e5c6`)
- **"Onshape changed since this was loaded. Refresh BOM"** shows in the header when the assembly is edited in Onshape (checked once a minute while the panel is visible). (QE12, `78c8308`)
- **Keyboard shortcuts:** Ctrl+F search, Alt+R Refresh BOM, Ctrl+Enter Publish, Esc closes the Publish dialog, "?" lists them. Buttons show their shortcut in the tooltip. (QE15, `e1b70c8`)
- **Time left** while publishing ("about 3 min left"). (QE7, `78eb4c9`)
- **Open on the website ↗** in the header for assemblies already in the database. (QE8, `a91a35d`)
- **‹ › buttons** next to "⚠ N problems" jump to the previous / next red cell. (QE9, `861346a`)
- **"Loaded from Onshape 5 min ago"** under the title, and the saved-copy note is now an amber banner. (QE13, `c93de1d`)
- **A server status dot** after the assembly name: green, amber (waking up), red (the reason on hover). (QE14, `9ecf0e5`)

## Changes

- The panel works in narrow sidebars (Firefox): the header and toolbar wrap, dialogs fit. (QE19, `d174045`)
- Saves send the Onshape user name, so the server records who saved each item. (`74ea6cc`)
- The panel's table colours come from the shared stylesheet instead of a copy. No visible change. (O4, `33845f5`)

## Not tested yet

- None of it in the real panel: the new menu near the panel's edges, undo across a standard-mark change, the ↺ column, Excel-style selection and paste from Excel, the notification in Firefox's sidebar, Alt+R in Firefox, and the "Onshape changed" line after a real edit in Onshape. The narrow layout was checked by narrowing Chrome's panel, not in Firefox.
