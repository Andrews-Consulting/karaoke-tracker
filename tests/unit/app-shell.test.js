// Guards the service worker's APP_SHELL (R27): every module the app loads must
// be in it, or an installed copy fails offline the first time that screen is
// opened, and every path in it must exist, or the whole install fails
// (cache.addAll is all or nothing). sw.js asks for this in its header comment;
// this makes the unit suite ask too.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// The paths listed in sw.js, as written there (relative to the app root).
function appShell() {
  const source = read('sw.js');
  const block = source.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  if (!block) throw new Error('sw.js has no APP_SHELL array');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

// Every module reachable from js/app.js through static, side-effect and
// dynamic imports of relative paths, as root-relative paths.
function reachableModules(entry = 'js/app.js') {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = read(file);
    const specs = [
      ...source.matchAll(/from\s+'([^']+)'/g),
      ...source.matchAll(/^\s*import\s+'([^']+)'/gm),
      ...source.matchAll(/import\('([^']+)'\)/g),
    ].map((m) => m[1]).filter((s) => s.startsWith('.'));
    for (const spec of specs) {
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
    }
  }
  return [...seen].sort();
}

const SHELL = appShell();
const SHELL_SET = new Set(SHELL);

describe('sw.js APP_SHELL matches the app', () => {
  it('lists every module the app can load', () => {
    const missing = reachableModules().filter((file) => !SHELL_SET.has(file));
    expect(missing).toEqual([]);
  });

  it('lists the page, its stylesheet, the manifest and the icons', () => {
    for (const must of ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'js/app.js', 'icons/icon-192.png']) {
      expect(SHELL_SET.has(must), `${must} is missing from APP_SHELL`).toBe(true);
    }
  });

  it('names only files that exist, so the install cannot fail on one', () => {
    const absent = SHELL.filter((p) => p !== './' && !existsSync(path.join(ROOT, p)));
    expect(absent).toEqual([]);
  });

  it('lists no module twice', () => {
    expect(SHELL.length).toBe(SHELL_SET.size);
  });
});
