# Extension: next version

**Unreleased.** On `MASTER`, not built yet.

## Before handing it out

- **Firefox: everyone who installed 5.0.0 must install this version by hand once.** From then on Firefox updates it by itself.
- After Mozilla signs it: `npm run release -- firefox-update <signed .xpi>` copies the file to the website (`public/firefox/`) and adds it to `updates.json`; then commit and push `MASTER`.

## New

- **Firefox automatic updates.** The Firefox build points to `https://demacia5635.github.io/Demacia-Bom-app/firefox/updates.json`; signed versions are kept on the website next to it. Chrome is unchanged. (`ee02915`)

- **"Update available: X" tag** after the panel title when a newer version has been announced. Hover says "You have Y. Click to get X."; clicking opens the team's Drive folder of builds. It checks when the panel opens and every 6 hours (at most once an hour). (`71879c8`)

## For the team

- **Release script:** `npm run release -- <extension|website|server> <patch|minor|major>` (`--dry-run` shows what it would do; `--no-checks` skips the checks). It bumps the right version file, runs typecheck, tests, lint and the builds (for the server, its own packages and a load test), puts the version back if anything fails, commits only the version files, and never pushes. It prints what's left to do. (`58ddebd`, `132b4cc`)
- After putting a new version's builds in the team's Drive folder, announce it so the tag appears: `npm run release -- firefox-update <signed .xpi>` (Firefox signed) or `npm run release -- extension-announce` (nothing to sign), then commit and push `MASTER`. (`71879c8`)
- Unit tests for the panel's logic (publish errors, part sizes, same-part matching, copying rows, Onshape BOM parsing, suggested fixes): 32 new, 88 in all. (`8303166`)
- The extension and website now share one "who saved it" header, sent only on saves. No visible change. (`f78c172`)

## Not tested yet

- The frozen Avatar / Name columns in Firefox's narrow sidebar were checked against the code only (at 320 px Name narrows to about 94 px); worth a glance in the real sidebar.
