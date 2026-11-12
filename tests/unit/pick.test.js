import { describe, it, expect } from 'vitest';
import { pickRandom } from '../../js/lib/pick.js';

describe('R13 pickRandom', () => {
  it('gives null when there is nothing to pick', () => {
    expect(pickRandom([])).toBeNull();
    expect(pickRandom(null)).toBeNull();
    expect(pickRandom(undefined)).toBeNull();
  });

  it('uses the random number it is given', () => {
    const items = ['a', 'b', 'c', 'd'];
    expect(pickRandom(items, () => 0)).toBe('a');
    expect(pickRandom(items, () => 0.25)).toBe('b');
    expect(pickRandom(items, () => 0.5)).toBe('c');
    expect(pickRandom(items, () => 0.99)).toBe('d');
  });

  it('picks the only item of a list of one', () => {
    const only = { id: 1, title: 'Valerie' };
    expect(pickRandom([only], () => 0.7)).toBe(only);
  });

  it('always returns an item of the list, even if random() strays outside [0, 1)', () => {
    const items = [1, 2, 3];
    for (const value of [1, 1.5, -0.2, NaN, Infinity, -Infinity]) {
      expect(items).toContain(pickRandom(items, () => value));
    }
    for (let i = 0; i < 200; i++) expect(items).toContain(pickRandom(items));
  });

  it('can pick every item', () => {
    const items = ['a', 'b', 'c'];
    const seen = new Set();
    for (let i = 0; i < items.length; i++) seen.add(pickRandom(items, () => i / items.length));
    expect([...seen].sort()).toEqual(items);
  });
});
