// Guards that keep docs/REQUIREMENTS.md and the e2e suite in step.
//
// The requirements sheet is the app's coverage catalog: every built behaviour
// has a row, and a row reads Done only when it names the e2e test that proves
// it. Those names drift when a test is renamed or added without the sheet, and
// nothing noticed until the sheet was audited by hand on 2026-11-16. These
// checks fail the unit suite instead:
//
//   - a test the sheet names must exist, word for word
//   - an e2e test named for a requirement ("R37: …") must be cited by a row,
//     and its requirement must be a current row (not only in History)
//   - a Done row names at least one e2e test; Built and Planned rows name none
//   - a unit test file the sheet names must exist
//
// What no check can do is confirm that a test's title is true of what it
// asserts. That still takes reading the test.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHEET = readFileSync(path.join(ROOT, 'docs', 'REQUIREMENTS.md'), 'utf8');
const E2E_DIR = path.join(ROOT, 'tests', 'e2e');

const unescape = (text) => text.replace(/\\(.)/g, '$1');

// Rows of the requirement tables: | ID | Requirement | Priority | Status | Notes |.
// History and Out of scope rows have fewer cells and are left out on purpose.
function rows() {
  const out = [];
  const re = /^\| (R\d+) \| (.*?) \| (Must|Should|Could) \| (Done|Built|Planned) \| (.*) \|$/gm;
  for (const m of SHEET.matchAll(re)) {
    const [, id, requirement, priority, status, notes] = m;
    out.push({ id, requirement, priority, status, notes, tests: citedTests(notes) });
  }
  return out;
}

// The e2e tests a Notes cell names: quoted titles starting with an R-number.
// Inside a quoted title a double quote is written \" in the sheet.
function citedTests(notes) {
  return [...notes.matchAll(/"(R\d+: (?:\\.|[^"\\])*)"/g)].map((m) => unescape(m[1]));
}

// Every test title in tests/e2e/*.spec.js, with the file it is in.
function e2eTests() {
  const out = [];
  for (const name of readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.js')).sort()) {
    const source = readFileSync(path.join(E2E_DIR, name), 'utf8');
    for (const m of source.matchAll(/^\s*test\((['"])((?:\\.|(?!\1)[^\\])*)\1/gm)) {
      out.push({ title: unescape(m[2]), file: `tests/e2e/${name}` });
    }
  }
  return out;
}

const ROWS = rows();
const TESTS = e2eTests();
const TITLES = new Set(TESTS.map((t) => t.title));
const CITED = new Set(ROWS.flatMap((r) => r.tests));
const IDS = new Set(ROWS.map((r) => r.id));

describe('REQUIREMENTS.md and the e2e suite stay in step', () => {
  it('reads the sheet and the suite', () => {
    expect(ROWS.length).toBeGreaterThan(50);
    expect(TESTS.length).toBeGreaterThan(100);
  });

  it('names no requirement twice', () => {
    const seen = new Set();
    const dupes = ROWS.map((r) => r.id).filter((id) => seen.size === seen.add(id).size);
    expect(dupes).toEqual([]);
  });

  it('every e2e test the sheet names exists with that exact title', () => {
    const missing = ROWS.flatMap((r) => r.tests.filter((t) => !TITLES.has(t)).map((t) => `${r.id} names "${t}"`));
    expect(missing).toEqual([]);
  });

  it('every e2e test named for a requirement is cited by a row', () => {
    const uncited = TESTS
      .filter((t) => /^R\d+:/.test(t.title) && !CITED.has(t.title))
      .map((t) => `${t.file}: "${t.title}"`);
    expect(uncited).toEqual([]);
  });

  it('every requirement a test is named for is a current row', () => {
    const orphans = TESTS
      .map((t) => ({ ...t, id: (t.title.match(/^(R\d+):/) || [])[1] }))
      .filter((t) => t.id && !IDS.has(t.id))
      .map((t) => `${t.file}: "${t.title}" (${t.id} is not a row)`);
    expect(orphans).toEqual([]);
  });

  it('a Done row names at least one e2e test; Built and Planned rows name none', () => {
    const wrong = ROWS
      .filter((r) => (r.status === 'Done') !== (r.tests.length > 0))
      .map((r) => `${r.id} is ${r.status} and names ${r.tests.length} e2e tests`);
    expect(wrong).toEqual([]);
  });

  it('every unit test file the sheet names exists', () => {
    const named = [...new Set([...SHEET.matchAll(/tests\/unit\/[\w.-]+\.test\.js/g)].map((m) => m[0]))];
    const missing = named.filter((p) => !existsSync(path.join(ROOT, p)));
    expect(named.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
