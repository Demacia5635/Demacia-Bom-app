# Website: next version

**Unreleased.** `fe511b9` and `745a04b` are live on the website since 2026-11-21 15:48. `d2024bf` is live since 16:27.

## Changes

- **No visible change.** The shared table gained two options that only the extension uses: a small label over a picture's corner, and a different-looking open button per row (`745a04b`). Without them the tables render exactly as before.
- A right-click menu option added in `fe511b9` was removed again in `d2024bf`, since the extension no longer uses it. The table's right-click behaviour is back to what it was. The website's BOM and work-order pages keep their own right-click menus, and the column Move Left / Move Right menu is unchanged.

## Not tested yet

- Not checked in a real browser. The table was checked in scripted browser tests: without the new options it renders the same HTML as before, and right-click works as before on both pages.
