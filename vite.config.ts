import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { buildServiceWorker, precacheList } from './src/pwa/precache.ts';

/** All files under `dir`, as paths relative to it. */
function walk(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), root) : [relative(root, join(dir, e.name))],
  );
}

/**
 * Writes dist/sw.js once the build (including public/) is on disk: the template in src/pwa/sw.js
 * plus the list of files to precache and a version hash of their contents.
 */
function serviceWorker(): Plugin {
  return {
    name: 'nrp-service-worker',
    apply: 'build',
    writeBundle: {
      order: 'post',
      handler(options) {
        const outDir = options.dir!;
        const files = walk(outDir).map((f) => f.replace(/\\/g, '/'));
        const hash = createHash('sha256');
        for (const f of precacheList(files)) {
          hash.update(f).update(readFileSync(join(outDir, f === './' ? 'index.html' : f)));
        }
        const template = readFileSync(new URL('./src/pwa/sw.js', import.meta.url), 'utf8');
        writeFileSync(join(outDir, 'sw.js'), buildServiceWorker(template, files, hash.digest('hex').slice(0, 16)));
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  server: { allowedHosts: ['.trycloudflare.com'] },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
