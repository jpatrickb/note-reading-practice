// Build-time helpers for the service worker (used by the plugin in vite.config.ts). Pure, so tested.

/** Files in dist/ that must never be precached: host config, the worker itself, source maps. */
const SKIP = [/^_headers$/, /^_redirects$/, /^sw\.js$/, /\.map$/, /(^|\/)\./];

/**
 * dist-relative paths (forward slashes) → the sorted list of URLs to precache, relative to the scope.
 * index.html becomes "./" because Cloudflare Pages redirects /index.html to /.
 */
export function precacheList(files: string[]): string[] {
  return files
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => !SKIP.some((re) => re.test(f)))
    .map((f) => (f === 'index.html' ? './' : f))
    .sort();
}

/**
 * Fill in the worker template. `version` must change whenever any precached file changes (the
 * plugin hashes their contents), so a deploy always yields a byte-different sw.js, which is what
 * makes browsers install the new version.
 */
export function buildServiceWorker(template: string, files: string[], version: string): string {
  const list = precacheList(files);
  if (!list.includes('./')) throw new Error('service worker: index.html missing from the build');
  return template
    .replace('self.__SW_VERSION__', () => JSON.stringify(version))
    .replace('self.__SW_PRECACHE__', () => JSON.stringify(list));
}
