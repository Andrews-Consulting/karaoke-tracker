// End-to-end tests drive the real app in mobile browser profiles.
//
// PORT picks the static server's port (default 8000) so several worktrees can
// run their suites at the same time:  PORT=8001 npm run test:e2e
//
// Every test gets a fresh browser context, so IndexedDB starts empty.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 8000;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: `node tools/serve.js`,
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/`,
    // Never reuse: a server already on this port could be serving another worktree.
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
