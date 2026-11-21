# Website: next version

**Unreleased.** The commits below are on branch `fix/web`, not on `MASTER` yet. They go in with the next version once the branch is merged.

## Fixes (from the code-review checklist)

- **Part Portal's Download STL and Download Parasolid buttons work.** They always failed before. A button is greyed out when that file doesn't exist, and a failed download shows a message instead of doing nothing. (B1, `5c12c17`)

## Not tested yet

- No actual download was tried in a browser (it needs the server with Drive access). Type check and build pass.
