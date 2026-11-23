# Extension: next version

**Unreleased.** On `MASTER`, not built yet.

## Before handing it out

- **Firefox: everyone who installed 5.0.0 must install this version by hand once.** From then on Firefox updates it by itself.
- After Mozilla signs it: `npm run release -- firefox-update <signed .xpi>` copies the file to the website (`public/firefox/`) and adds it to `updates.json`; then commit and push `MASTER`.

## New

- **Firefox automatic updates.** The Firefox build points to `https://demacia5635.github.io/Demacia-Bom-app/firefox/updates.json`; signed versions are kept on the website next to it. Chrome is unchanged. (`ee02915`)

## For the team

- **Release script:** `npm run release -- <extension|website|server> <patch|minor|major>` (`--dry-run` shows what it would do; `--no-checks` skips the checks). It bumps the right version file, runs typecheck, tests, lint and the builds (for the server, its own packages and a load test), puts the version back if anything fails, commits only the version files, and never pushes. It prints what's left to do. (`58ddebd`, `132b4cc`)
