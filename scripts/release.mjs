/**
 * Makes a new version of the website, the server or the extension: bumps its
 * version, runs the checks, and commits only the version files. Never pushes.
 *
 *   npm run release -- extension patch|minor|major
 *   npm run release -- website   patch|minor|major
 *   npm run release -- server    patch|minor|major
 *   npm run release -- firefox-update <signed .xpi>
 *
 * Flags:
 *   --dry-run     show what it would do; changes nothing
 *   --no-checks   skip the checks (typecheck, tests, lint, builds)
 *
 * Steps:
 *   1. Stops if the git tree isn't clean (warns, but goes on, when not on MASTER).
 *   2. Bumps the version:
 *        extension -> package.json + package-lock.json (its root version)
 *        website   -> site-version.json
 *        server    -> server/package.json + server/package-lock.json
 *   3. Checks: npm run typecheck, npm test, npm run lint (errors only), then
 *        extension -> npm run package:extension (both builds, zipped into publish/<version>/)
 *        website   -> npm run build (needs VITE_CLIENT_URL)
 *        server    -> npm --prefix server run build (type check only; needs server/node_modules)
 *      Any failure puts the version files back and stops.
 *   4. Commits the version files: "Extension 5.0.1" / "Website 2.1.4" / "Server 5.0.1".
 *   5. Prints what's left (push / deploy / sign, and dating the log).
 *
 * No dependencies.
 */
import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = {
  extension: {
    title: "Extension",
    files: [
      { path: "package.json", kind: "package" },
      { path: "package-lock.json", kind: "lock" },
    ],
  },
  website: {
    title: "Website",
    files: [{ path: "site-version.json", kind: "package" }],
  },
  server: {
    title: "Server",
    files: [
      { path: "server/package.json", kind: "package" },
      { path: "server/package-lock.json", kind: "lock" },
    ],
  },
};
const BUMPS = ["patch", "minor", "major"];

// ---- arguments ----
const args = process.argv.slice(2);

/**
 * After Mozilla signed a Firefox version: copies the signed .xpi to
 * public/firefox/demacia-bom-<version>.xpi and adds it to
 * public/firefox/updates.json (with its sha256 update_hash), where installed
 * copies look for updates (the manifest's update_url). The version is
 * package.json's. Doesn't commit; deploy the website (push MASTER) to publish it.
 */
if (args[0] === "firefox-update") {
  const xpi = args[1];
  if (!xpi || !existsSync(xpi) || !/\.xpi$/i.test(xpi)) {
    console.error("Usage: npm run release -- firefox-update <path to the signed .xpi from addons.mozilla.org>");
    process.exit(1);
  }
  const ADDON_ID = "demacia-bom@demacia5635";
  const SITE = "https://demacia5635.github.io/Demacia-Bom-app/firefox/";
  const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  const name = `demacia-bom-${version}.xpi`;
  const target = join(ROOT, "public", "firefox", name);
  const hash = "sha256:" + createHash("sha256").update(readFileSync(xpi)).digest("hex");
  const updatesPath = join(ROOT, "public", "firefox", "updates.json");
  const updates = JSON.parse(readFileSync(updatesPath, "utf8"));
  const list = (updates.addons[ADDON_ID] ??= { updates: [] }).updates;
  const entry = { version, update_link: SITE + name, update_hash: hash };
  const at = list.findIndex((u) => u.version === version);
  if (at >= 0) list[at] = entry;
  else list.push(entry);
  copyFileSync(xpi, target);
  writeFileSync(updatesPath, JSON.stringify(updates, null, 2) + "\n");
  console.log(`Firefox ${version}: copied to public/firefox/${name}, updates.json now lists:`);
  console.log(JSON.stringify(entry, null, 2));
  console.log("\nLeft to do: commit public/firefox/, then push MASTER (the website deploy publishes it).");
  console.log("Copies installed from 5.0.0 or earlier have no update_url: install this version once by hand.");
  process.exit(0);
}
const dryRun = args.includes("--dry-run");
const noChecks = args.includes("--no-checks");
const [target, bump] = args.filter((a) => !a.startsWith("--"));
if (!(target in TARGETS) || !BUMPS.includes(bump)) {
  console.error(
    "Usage: npm run release -- <extension|website|server> <patch|minor|major> [--dry-run] [--no-checks]"
  );
  process.exit(1);
}
const T = TARGETS[target];

// ---- helpers ----
const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8" }).trim();
const say = (msg) => console.log(msg);
const step = (msg) => console.log(`\n▶ ${msg}`);

/** Runs a command in the repo, showing its output; true when it succeeded. */
function run(cmd, env = {}) {
  say(`  $ ${cmd}`);
  if (dryRun) return true;
  const r = spawnSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true, env: { ...process.env, ...env } });
  return r.status === 0;
}

export function nextVersion(version, kind) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`Not a version: ${version}`);
  const [maj, min, pat] = m.slice(1).map(Number);
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

/**
 * The file's text with the new version: JSON is edited in place, keeping its
 * formatting. A lock file whose root version had fallen behind is brought in line.
 */
function withVersion(text, kind, from, to) {
  const json = JSON.parse(text);
  if (kind === "package" && json.version !== from) throw new Error(`expected version ${from}, found ${json.version}`);
  // The first "version" field is the file's own (package.json, site-version.json, the lock's root).
  let out = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${to}$2`);
  if (kind === "lock") {
    // The lock repeats it for the root package (packages[""].version).
    out = out.replace(/("packages"\s*:\s*\{\s*""\s*:\s*\{[^{}]*?"version"\s*:\s*")[^"]*(")/, `$1${to}$2`);
    const check = JSON.parse(out);
    if (check.version !== to || (check.packages?.[""] && check.packages[""].version !== to)) {
      throw new Error("couldn't update both versions in the lock file");
    }
  }
  return out;
}

// ---- 1. the working tree ----
step("Checking the git tree");
const branch = git("rev-parse --abbrev-ref HEAD");
if (git("status --porcelain")) {
  console.error("  The git tree has uncommitted changes. Commit or put them aside first.");
  process.exit(1);
}
if (branch !== "MASTER") say(`  Warning: on "${branch}", not MASTER. Going on.`);
else say("  Clean, on MASTER.");

// ---- 2. the version ----
const main = T.files[0];
const from = JSON.parse(readFileSync(join(ROOT, main.path), "utf8")).version;
const to = nextVersion(from, bump);
step(`${T.title}: ${from} -> ${to} (${bump})`);
const originals = new Map();
const updated = new Map();
for (const f of T.files) {
  const full = join(ROOT, f.path);
  const text = readFileSync(full, "utf8");
  originals.set(full, text);
  try {
    updated.set(full, withVersion(text, f.kind, from, to));
  } catch (err) {
    console.error(`  ${f.path}: ${err.message}. Nothing was changed.`);
    process.exit(1);
  }
  const was = JSON.parse(text).version;
  say(`  ${f.path}${was !== from ? ` (was ${was}: brought in line)` : ""}`);
}
// Written only once every file could be updated.
if (!dryRun) for (const [full, text] of updated) writeFileSync(full, text);

/** Puts the version files back and stops. */
function undo(why) {
  console.error(`\n✖ ${why}`);
  if (!dryRun) for (const [full, text] of originals) writeFileSync(full, text);
  console.error(`  The version files are back at ${from}. Nothing was committed.`);
  process.exit(1);
}

// ---- 3. checks ----
if (noChecks) {
  step("Checks skipped (--no-checks)");
} else {
  step("Checks");
  if (!run("npm run typecheck")) undo("Typecheck failed.");
  if (!run("npm test")) undo("Tests failed.");
  // oxlint exits non-zero only on errors (warnings are printed).
  if (!run("npm run lint")) undo("Lint found errors.");
  if (target === "extension") {
    if (!run("npm run package:extension")) undo("Building or zipping the extension failed.");
  } else if (target === "website") {
    if (!run("npm run build")) undo("The website build failed (is VITE_CLIENT_URL set in .env.local?).");
  } else if (!run("npm --prefix server run build")) {
    undo("The server type check failed (run `npm --prefix server install` once if server/node_modules is missing).");
  }
}

// ---- 4. commit ----
const message = `${T.title} ${to}`;
step(`Committing "${message}"`);
const paths = T.files.map((f) => f.path).join(" ");
say(`  $ git commit -m "${message}" -- ${paths}`);
if (!dryRun) {
  git(`add -- ${paths}`);
  git(`commit -q -m "${message}" -- ${paths}`);
  say(`  ${git("log --oneline -1")}`);
}

// ---- 5. what's left ----
step("Left to do (not done by this script)");
const todo = {
  extension: [
    `Share the zips in publish/${to}/ (they contain the client secret: team only).`,
    "Firefox: upload the Firefox zip to addons.mozilla.org to have it signed, then run",
    "  npm run release -- firefox-update <the signed .xpi>  (adds it to the website's updates.json).",
  ],
  website: ["Push MASTER: GitHub Pages deploys the website from it."],
  server: ["Push MASTER, then redeploy the server on Render."],
}[target];
for (const t of todo) say(`  - ${t}`);
say(`  - Logs: ask the coordinator to date the ${T.title.toLowerCase()} log for ${to}.`);
say("  - Nothing was pushed.");
if (dryRun) say("\n(dry run: nothing was changed)");
