# Website: next version

**Unreleased.** Committed on `MASTER` (`fe511b9`, `745a04b`), not pushed yet.

## Changes

- **No visible change.** The shared table gained three options that only the extension uses (extension, next version): a right-click menu on rows (`fe511b9`), a small label over a picture's corner, and a different-looking open button per row (`745a04b`). Without them the tables render exactly as before. The website's BOM and work-order pages keep their own right-click menus, and the column Move Left / Move Right menu is unchanged.

## Not tested yet

- Not checked in a real browser. The table was checked in scripted browser tests: without the new options it renders the same HTML as before, and right-click works as before on both pages.
