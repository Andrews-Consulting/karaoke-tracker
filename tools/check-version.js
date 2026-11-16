// Fails when a change touches a cached file without bumping the version.
//
//   node tools/check-version.js <base>      e.g. origin/main, dev
//
// Installed copies of the app only fetch new files when the service worker's
// cache name changes, and that name comes from APP_VERSION in js/version.js.
// So a pull request that changes any file in sw.js's APP_SHELL (or sw.js
// itself) must change js/version.js too. This compares the branch with
// `base` and exits 1, saying which files, when it does not. CI runs it on
// every pull request (.github/workflows/ci.yml); run it by hand before
// opening one.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_FILE = 'js/version.js';
const base = process.argv[2];
if (!base) {
  console.error('Usage: node tools/check-version.js <base ref>');
  process.exit(2);
}

const shellBlock = readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/const APP_SHELL = \[([\s\S]*?)\];/);
if (!shellBlock) throw new Error('sw.js has no APP_SHELL array');
const cached = new Set([...shellBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).map((p) => (p === './' ? 'index.html' : p)));
cached.add('sw.js');

const changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean);
const cachedChanged = changed.filter((file) => cached.has(file));
const bumped = changed.includes(VERSION_FILE);

if (cachedChanged.length && !bumped) {
  console.error(`These cached files changed against ${base} but ${VERSION_FILE} did not:\n  ${cachedChanged.join('\n  ')}`);
  console.error(`\nBump APP_VERSION in ${VERSION_FILE} (and package.json to match), or installed copies keep the old files.`);
  process.exit(1);
}
console.log(cachedChanged.length
  ? `${cachedChanged.length} cached file(s) changed and ${VERSION_FILE} was bumped.`
  : 'No cached file changed; no version bump needed.');
