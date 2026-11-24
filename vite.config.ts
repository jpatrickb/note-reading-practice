import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
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
