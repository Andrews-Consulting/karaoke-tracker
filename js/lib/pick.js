// "Pick for me" (R13). Pure: no DOM, no IndexedDB.

// One item of `items` at random, or null when there are none. `random`
// returns a number in [0, 1), like Math.random; tests pass their own.
export function pickRandom(items, random = Math.random) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const index = Math.floor(Number(random()) * items.length);
  // A random() that strays outside [0, 1) still gives one of the items.
  return items[Math.min(items.length - 1, Math.max(0, Number.isFinite(index) ? index : 0))];
}
