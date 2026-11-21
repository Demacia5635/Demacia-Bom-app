# Website: next version

**Unreleased.** `fe511b9` and `745a04b` are live on the website since 2026-11-21 15:48. `d2024bf` is live since 16:27. `fa2e811` is committed but not pushed yet.

## Changes

- **No visible change.** The shared table gained one option that only the extension uses: a small label over a picture's corner (`745a04b`). Without it the tables render exactly as before.
- Two other options added on the way, a right-click menu (`fe511b9`) and a per-row open-button style (`745a04b`), were removed again (`d2024bf`, `fa2e811`) since the extension no longer uses them. The table's right-click and open buttons are back to what they were. The website's BOM and work-order pages keep their own right-click menus, and the column Move Left / Move Right menu is unchanged.

## Not tested yet

- Not checked in a real browser. The table was checked in scripted browser tests: without the new options it renders the same HTML as before, and right-click works as before on both pages.
