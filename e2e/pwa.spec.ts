// Installable, offline-capable PWA: manifest, service worker, install tip, update prompt.
import { readFile } from 'node:fs/promises';
import { type AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { type Page, expect, test } from '@playwright/test';

const IPAD_SAFARI_UA =
  'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** PNG width × height from the IHDR chunk. */
function pngSize(buf: Buffer): string {
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

async function answerOneQuestion(page: Page) {
  await page.getByRole('button', { name: /Start/ }).click();
  await expect(page.locator('.pad__key:not([disabled])').first()).toBeVisible();
  const letter = (await page.locator('svg.staff').getAttribute('data-note'))![0]!;
  await page.locator(`[data-answer="${letter}"]`).click();
  await expect(page.locator('.praise')).toBeVisible();
}

/** Wait until the service worker controls the page (it claims it on the first visit). */
async function waitForServiceWorker(page: Page) {
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10_000 }).toBe(true);
}

/** Is a new version downloaded and waiting? (null while the page is reloading) */
const hasWaitingWorker = (page: Page) =>
  page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting).catch(() => null);

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Serves the built app (dist/) with a switch to "deploy a new version": a byte-different sw.js.
 * Playwright's request routing can't intercept the browser's own service-worker update check.
 */
async function serveDist() {
  let version = '';
  const server = createServer(async (req, res) => {
    const path = new URL(req.url!, 'http://x').pathname;
    const file = normalize(join('dist', path.endsWith('/') ? `${path}index.html` : path));
    try {
      let body: Buffer | string = await readFile(file);
      if (path === '/sw.js') body = `${body}\n// ${version}\n`;
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    deploy: (v: string) => (version = v),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('the manifest is linked and valid, and its icons load', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifestUrl = new URL(href!, page.url());
  const res = await request.get(manifestUrl.href);
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: 'Note Reader', short_name: 'Note Reader', display: 'standalone', orientation: 'any' });
  expect(new URL(m.start_url, manifestUrl).href).toBe(new URL('/', page.url()).href);
  expect(new URL(m.scope, manifestUrl).href).toBe(new URL('/', page.url()).href);
  const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
  expect(m.theme_color).toBe(themeColor);
  expect(m.background_color).toBe(themeColor);

  const purposes = new Set<string>();
  for (const icon of m.icons as { src: string; sizes: string; type: string; purpose: string }[]) {
    const r = await request.get(new URL(icon.src, manifestUrl).href);
    expect(r.ok(), icon.src).toBe(true);
    if (icon.type === 'image/png') {
      expect(pngSize(await r.body()), icon.src).toBe(icon.sizes);
      purposes.add(`${icon.purpose} ${icon.sizes}`);
    }
  }
  expect(purposes).toEqual(new Set(['any 192x192', 'any 512x512', 'maskable 512x512']));

  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(pngSize(await (await request.get(new URL(touch!, page.url()).href)).body())).toBe('180x180');
});

test.describe('service worker (Chromium only)', () => {
  // Playwright can't emulate offline mode for service workers in WebKit, so these run in Chromium.
  // The real-iPad check is manual (see the PR's checklist).
  test.skip(({ browserName }) => browserName !== 'chromium', 'service worker offline emulation is Chromium-only in Playwright');

  test('after the first visit the game works offline', async ({ page, context }) => {
    await page.goto('/');
    await waitForServiceWorker(page);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: /Note Reader/ })).toBeVisible();
    await answerOneQuestion(page);
    // Deep links keep working too.
    await page.goto('/?from=homescreen');
    await expect(page.getByRole('button', { name: /Start/ })).toBeVisible();
  });

  test('a new version waits for the home screen and never interrupts a session', async ({ page }) => {
    test.skip(!!process.env.E2E_BASE_URL, 'needs a local build to "deploy" a new version');
    const site = await serveDist();
    await page.goto(site.url);
    await waitForServiceWorker(page);
    await answerOneQuestion(page); // mid-session now

    // Deploy a new version, then let the browser find it (as it would on its own, later).
    site.deploy('v2');
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await expect.poll(() => hasWaitingWorker(page)).toBe(true);

    // Still mid-session: no banner, no reload, the game carries on.
    await expect(page.locator('.feedback')).toBeVisible();
    await expect(page.getByTestId('update-ready')).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(page.locator('.pad__key').first()).toBeVisible();

    // Back home: the kid gets a small, optional prompt.
    await page.getByRole('button', { name: 'Stop and go home' }).click();
    await expect(page.getByTestId('update-ready')).toBeVisible();
    await page.getByRole('button', { name: 'Tap to refresh' }).click();
    await expect.poll(() => hasWaitingWorker(page)).toBe(false); // the new version took over
    await expect(page.getByRole('button', { name: /Start/ })).toBeVisible();
    await expect(page.getByTestId('update-ready')).toHaveCount(0);
    await site.close();
  });

  test('a new version found before the kid touches anything is applied at launch', async ({ page }) => {
    test.skip(!!process.env.E2E_BASE_URL, 'needs a local build to "deploy" a new version');
    const site = await serveDist();
    await page.addInitScript(() => sessionStorage.setItem('loads', String(Number(sessionStorage.getItem('loads') ?? 0) + 1)));
    await page.goto(site.url);
    await waitForServiceWorker(page);
    site.deploy('v2');
    // The browser checks for updates on every page load; nobody has tapped anything yet, so the
    // app switches to the new version by itself with one extra reload.
    await page.reload();
    const loads = () => page.evaluate(() => sessionStorage.getItem('loads')).catch(() => null);
    await expect.poll(loads).toBe('3');
    await expect.poll(() => hasWaitingWorker(page)).toBe(false);
    await expect(page.getByRole('button', { name: /Start/ })).toBeVisible();
    await expect(page.getByTestId('update-ready')).toHaveCount(0);
    await site.close();
  });
});

test.describe('install tip on iPad Safari', () => {
  test.use({ userAgent: IPAD_SAFARI_UA });

  test('explains Share → Add to Home Screen, and "Not now" is remembered', async ({ page }) => {
    await page.goto('/');
    const tip = page.getByTestId('install-tip');
    await expect(tip).toContainText('Add to Home Screen');
    await expect(tip.getByRole('img', { name: 'Share' })).toBeVisible();
    await tip.getByRole('button', { name: 'Not now' }).click();
    await expect(tip).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: /Start/ })).toBeVisible();
    await expect(page.getByTestId('install-tip')).toHaveCount(0);
  });

  test('is hidden when already installed (standalone)', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Start/ })).toBeVisible();
    await expect(page.getByTestId('install-tip')).toHaveCount(0);
    // A fresh Home Screen app has its own storage: offer to bring progress over from Safari.
    await expect(page.getByTestId('transfer-tip')).toBeVisible();
    await page.getByTestId('transfer-tip').getByRole('button', { name: 'Load a code' }).click();
    await expect(page.getByLabel('Progress code to load')).toBeVisible();
  });

  test('the Save screen warns that Safari may erase progress', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.getByTestId('durability')).toHaveAttribute('data-level', /risk|safe/);
    await expect(page.getByTestId('durability')).toContainText(/progress/);
  });
});

test('Chromium gets an "Install app" button from beforeinstallprompt', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'iPad gets the Share → Add to Home Screen tip instead');
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Start/ })).toBeVisible();
  await expect(page.getByTestId('install-tip')).toHaveCount(0);
  await page.evaluate(() => {
    const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => {
        (window as { prompted?: boolean }).prompted = true;
      },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(e);
  });
  await page.getByRole('button', { name: 'Install app' }).click();
  expect(await page.evaluate(() => (window as { prompted?: boolean }).prompted)).toBe(true);
  await expect(page.getByTestId('install-tip')).toHaveCount(0);
});

test('the install tip is hidden in display-mode: standalone', async ({ page }) => {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (q.includes('display-mode: standalone') ? ({ matches: true } as MediaQueryList) : real(q));
  });
  await page.goto('/');
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) })));
  await expect(page.getByRole('button', { name: /Start/ })).toBeVisible();
  await expect(page.getByTestId('install-tip')).toHaveCount(0);
});

test('the Save screen says how safe progress is on this device', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.getByTestId('durability')).toHaveAttribute('data-level', /safe|unknown|risk/);
  await expect(page.getByTestId('durability')).not.toContainText('…');
});
