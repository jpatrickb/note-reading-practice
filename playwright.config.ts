import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets parallel worktrees each serve their own build (strictPort: never test someone else's).
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // Local runs stay light (CI gets the default); see CONTRIBUTING.md.
  workers: process.env.CI ? undefined : 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    // Real iPad engine. Hosts that can't run Playwright's WebKit (e.g. Arch) can set NO_WEBKIT=1
    // to emulate the iPad viewport + touch in Chromium instead; CI always runs real WebKit.
    process.env.NO_WEBKIT
      ? { name: 'ipad-emulated', use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' as const } }
      : { name: 'ipad-webkit', use: { ...devices['iPad (gen 7) landscape'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx vite preview --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
});
