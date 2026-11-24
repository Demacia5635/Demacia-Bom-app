# Website: next version

**Unreleased.** On branch `fix/web`, not on `MASTER` yet.

## Changes

- **Work-order progress counts bought / standard parts too.** "Finished" now covers every line, made and bought (e.g. "43/46 (93%) finished" instead of "24/26"): a made part is finished at "Finished Manufacturing", a bought one at "Finished" (or Priority "Finished"). Lines set to "Untracked" aren't counted, so the bar can reach 100%. Same everywhere: the work-order page, the work-order list (and its "Only with unfinished parts" filter), and `#/production`. "Hide finished" and the chips are unchanged. (`23c2204`, with server `51338c6`)
