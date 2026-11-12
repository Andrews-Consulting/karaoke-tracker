// Unit tests cover the pure modules in js/lib/ (no DOM, no IndexedDB).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
