// The service worker template (src/pwa/sw.js), run against a fake worker scope and Cache Storage.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildServiceWorker, precacheList } from '../src/pwa/precache';

const ORIGIN = 'https://notes.test';
const SCOPE = `${ORIGIN}/`;
const TEMPLATE = readFileSync(new URL('../src/pwa/sw.js', import.meta.url), 'utf8');
const DIST = ['index.html', 'assets/index-abc.js', 'assets/index-def.css', 'icons/icon-192.png', 'manifest.webmanifest', '_headers', 'sw.js', 'assets/index-abc.js.map'];

describe('precacheList', () => {
  it('lists the built files, minus host config, the worker itself, and source maps', () => {
    expect(precacheList(DIST)).toEqual(['./', 'assets/index-abc.js', 'assets/index-def.css', 'icons/icon-192.png', 'manifest.webmanifest']);
  });

  it('normalizes Windows paths and skips dotfiles', () => {
    expect(precacheList(['index.html', 'assets\\a.js', '.DS_Store', 'icons/.keep'])).toEqual(['./', 'assets/a.js']);
  });
});

describe('buildServiceWorker', () => {
  it('fills in the version and the file list', () => {
    const sw = buildServiceWorker(TEMPLATE, DIST, 'v1');
    expect(sw).toContain('const VERSION = "v1";');
    expect(sw).toContain('"assets/index-abc.js"');
    expect(sw).not.toContain('self.__SW_');
  });

  it('refuses a build without index.html', () => {
    expect(() => buildServiceWorker(TEMPLATE, ['assets/a.js'], 'v1')).toThrow(/index.html/);
  });
});

// ─── fake worker environment ───

type Handler = (event: FakeEvent) => void;
interface FakeEvent {
  request?: Request;
  data?: unknown;
  done?: Promise<unknown>;
  response?: Promise<Response>;
  waitUntil(p: Promise<unknown>): void;
  respondWith(p: Promise<Response>): void;
}

function event(props: Partial<FakeEvent> = {}): FakeEvent {
  return {
    ...props,
    waitUntil(p) {
      this.done = p;
    },
    respondWith(p) {
      this.response = p;
    },
  };
}

function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  return {
    stores,
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async put(url: string, res: Response) {
          store.set(url, res);
        },
        async match(url: string) {
          return store.get(url)?.clone();
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };
}

function loadWorker(version = 'v1') {
  const handlers = new Map<string, Handler>();
  const self = {
    registration: { scope: SCOPE },
    location: { origin: ORIGIN },
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
  };
  const caches = fakeCaches();
  const fetch = vi.fn(async (req: Request) => new Response(`net:${new URL(req.url).pathname}`));
  new Function('self', 'caches', 'fetch', buildServiceWorker(TEMPLATE, DIST, version))(self, caches, fetch);
  const fire = (type: string, props: Partial<FakeEvent> = {}) => {
    const e = event(props);
    handlers.get(type)!(e);
    return e;
  };
  return { self, caches, fetch, fire };
}

const nav = (path: string) => ({ url: `${ORIGIN}${path}`, method: 'GET', mode: 'navigate' }) as Request;
const get = (url: string, method = 'GET') => ({ url, method, mode: 'cors' }) as Request;

describe('service worker', () => {
  let w: ReturnType<typeof loadWorker>;
  beforeEach(() => {
    w = loadWorker();
  });

  async function install() {
    await w.fire('install').done;
    w.fetch.mockClear();
  }

  it('precaches every built file, bypassing the HTTP cache', async () => {
    await w.fire('install').done;
    const requests = w.fetch.mock.calls.map(([r]) => r as Request);
    expect(requests.map((r) => r.url).sort()).toEqual(
      [SCOPE, `${SCOPE}assets/index-abc.js`, `${SCOPE}assets/index-def.css`, `${SCOPE}icons/icon-192.png`, `${SCOPE}manifest.webmanifest`].sort(),
    );
    expect(requests.every((r) => r.cache === 'reload')).toBe(true);
    expect([...w.caches.stores.get('nrp-precache-v1')!.keys()]).toHaveLength(5);
    expect(w.self.skipWaiting).not.toHaveBeenCalled(); // waits for the page to ask
  });

  it('fails the install (keeping the old version) if any file is missing', async () => {
    w.fetch.mockImplementation(async (req: Request) => new Response('nope', { status: req.url.endsWith('.css') ? 404 : 200 }));
    await expect(w.fire('install').done).rejects.toThrow(/HTTP 404/);
  });

  it('stores a clean copy of redirected responses', async () => {
    w.fetch.mockImplementation(async () => {
      const res = new Response('<html>');
      Object.defineProperty(res, 'redirected', { value: true });
      return res;
    });
    await w.fire('install').done;
    const page = w.caches.stores.get('nrp-precache-v1')!.get(SCOPE)!;
    expect(page.redirected).toBe(false);
    expect(await page.text()).toBe('<html>');
  });

  it('activates by deleting old versions only, then takes control', async () => {
    await w.caches.open('nrp-precache-old');
    await w.caches.open('someone-else');
    await install();
    await w.fire('activate').done;
    expect(await w.caches.keys()).toEqual(['someone-else', 'nrp-precache-v1']);
    expect(w.self.clients.claim).toHaveBeenCalled();
  });

  it('switches over only when the page says so', () => {
    w.fire('message', { data: 'something else' });
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    w.fire('message', { data: 'skip-waiting' });
    expect(w.self.skipWaiting).toHaveBeenCalled();
  });

  it('serves the cached page for app navigations, whatever the query', async () => {
    await install();
    for (const path of ['/', '/?debug', '/index.html']) {
      const e = w.fire('fetch', { request: nav(path) });
      expect(await (await e.response!).text()).toBe('net:/'); // the copy cached at install
    }
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('falls back to the network if the cache is gone', async () => {
    const e = w.fire('fetch', { request: nav('/') });
    expect(await (await e.response!).text()).toBe('net:/');
    expect(w.fetch).toHaveBeenCalledTimes(1);
  });

  it('serves precached assets from the cache', async () => {
    await install();
    const e = w.fire('fetch', { request: get(`${SCOPE}assets/index-abc.js`) });
    expect(await (await e.response!).text()).toBe('net:/assets/index-abc.js');
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('leaves everything else alone', async () => {
    await install();
    for (const request of [
      nav('/some/other/page'),
      get(`${SCOPE}sw.js`),
      get(`${SCOPE}assets/index-abc.js`, 'POST'),
      get('https://elsewhere.test/assets/index-abc.js'),
    ]) {
      expect(w.fire('fetch', { request }).response).toBeUndefined();
    }
  });
});
