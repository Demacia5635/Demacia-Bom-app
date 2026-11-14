/**
 * Builds the browser extension and zips it for sharing, one zip per browser.
 *
 *   npm run package:extension                        -> build + zip Chrome and Firefox
 *   npm run package:extension -- chrome              -> Chrome only (or: firefox)
 *   npm run package:extension -- --no-build          -> zip the existing dist folders as is
 *
 * Output: publish/demacia-bom-extension-<browser>-<version>.zip
 *   Chrome:  unzip, then chrome://extensions > Developer mode > Load unpacked > the folder.
 *   Firefox: about:debugging > This Firefox > Load Temporary Add-on > the zip itself
 *            (temporary: removed when Firefox restarts, unless the add-on is signed).
 *
 * Note: VITE_CLIENT_SECRET from .env.local is baked into the bundle — share privately.
 *
 * No dependencies: writes a standard zip with node:zlib (deflate + crc32).
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'publish');

const TARGETS = {
  chrome: { script: 'build:extension', dist: join(ROOT, 'dist-extension') },
  firefox: { script: 'build:extension:firefox', dist: join(ROOT, 'dist-extension-firefox') },
};

const args = process.argv.slice(2);
const build = !args.includes('--no-build');
const requested = args.filter((a) => !a.startsWith('--'));
const unknown = requested.filter((t) => !(t in TARGETS));
if (unknown.length) {
  console.error(`Unknown target(s): ${unknown.join(', ')}. Use: ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}
const targets = requested.length ? requested : Object.keys(TARGETS);

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/** MS-DOS time/date fields used by the zip format. */
function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/** Zips every file under `dir` (paths relative to it, so manifest.json is at the root). */
function zipDir(dir, outFile) {
  const { time, date } = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of listFiles(dir)) {
    // Zip entries always use forward slashes.
    const name = Buffer.from(relative(dir, file).split('\\').join('/'), 'utf8');
    const data = readFileSync(file);
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    // extra len, comment len, disk no, internal attrs, external attrs = 0
    central.writeUInt32LE(offset, 42); // offset of local header

    localParts.push(local, name, compressed);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const entries = centralParts.length / 2;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(entries, 8);
  end.writeUInt16LE(entries, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, Buffer.concat([...localParts, centralDir, end]));
  return entries;
}

const results = [];
for (const target of targets) {
  const { script, dist } = TARGETS[target];
  if (build) execSync(`npm run ${script}`, { cwd: ROOT, stdio: 'inherit' });

  if (!existsSync(join(dist, 'manifest.json'))) {
    console.error(`${relative(ROOT, dist)}/manifest.json not found — run "npm run ${script}" first.`);
    process.exit(1);
  }
  const { version } = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
  const outFile = join(OUT_DIR, `demacia-bom-extension-${target}-${version}.zip`);
  const entries = zipDir(dist, outFile);
  results.push(`  ${target.padEnd(8)} ${entries} files -> ${relative(ROOT, outFile)}`);
}

console.log(`\nPackaged:\n${results.join('\n')}`);
