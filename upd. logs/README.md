# Update logs

One file per version: `v<version>.md`, listing what changed for team members and developers.

- A deploy is a push to `MASTER` (it publishes the website; the server is redeployed on Render by hand).
- Every deploy gets a new version and a new file. The version in `package.json` is set to match before pushing. The extension takes its version from `package.json`, so the zips are named after it too.
- Changes that are committed but not deployed yet go in the next version's file, marked **Unreleased**. On deploy, replace that line with the date.
- Versions: `2.x.y`. Increase `x` for a deploy with new behaviour or many fixes, and `y` for a deploy with only a few small fixes.

| Version | Deployed | Highlights |
|---|---|---|
| [2.0.0](v2.0.0.md) | Not pushed yet | First official release: safe Publish BOM, correct sub-assembly quantities, Standard Parts page, work-order PDF export, safer saves, server hardening |
