// Sets the app's version number everywhere it is written.
//
//   npm run bump 1.0.57
//
// Writes the number to js/version.js (APP_VERSION, shown in Settings and in
// the guide), sw.js (CACHE_VERSION, which names the service worker's cache so
// installed copies fetch the new files) and package.json. The three must
// agree, and tests/unit/app-shell.test.js fails when they do not; this keeps
// a bump to one command. sw.js keeps its own copy on purpose: it must stay a
// classic script, and a classic script cannot import js/version.js.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Usage: npm run bump <major.minor.patch>   e.g. npm run bump 1.0.57');
  process.exit(2);
}

const edits = [
  ['js/version.js', /export const APP_VERSION = '[^']*';/, `export const APP_VERSION = '${version}';`],
  ['sw.js', /const CACHE_VERSION = 'v[^']*';/, `const CACHE_VERSION = 'v${version}';`],
  ['package.json', /"version": "[^"]*"/, `"version": "${version}"`],
];
for (const [file, pattern, replacement] of edits) {
  const abs = path.join(ROOT, file);
  const before = readFileSync(abs, 'utf8');
  if (!pattern.test(before)) throw new Error(`${file}: no version line matching ${pattern}`);
  writeFileSync(abs, before.replace(pattern, replacement));
  console.log(`${file}: ${version}`);
}
