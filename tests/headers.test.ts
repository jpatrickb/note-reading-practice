// public/_headers is easy to break silently (see decision D45), so check its shape here.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** Path → its header lines (comments dropped). */
function parse(text: string): Map<string, string[]> {
  const rules = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      expect(rules.has(line), `duplicate rule for ${line}`).toBe(false);
      rules.set(line, (current = []));
    } else current!.push(line.trim());
  }
  return rules;
}

describe('_headers', () => {
  const rules = parse(read('public/_headers'));

  it('has one /* block with the security headers the smoke test checks', () => {
    const all = rules.get('/*')!;
    expect(all).toContain('X-Frame-Options: DENY');
    expect(all.some((h) => h.startsWith('Permissions-Policy: camera=()'))).toBe(true);
  });

  it('never lets the page, service worker, or manifest go stale', () => {
    for (const path of ['/', '/index.html', '/sw.js', '/manifest.webmanifest']) {
      expect(rules.get(path), path).toContain('Cache-Control: no-cache');
    }
  });

  it('still takes the deploy workflow’s staging noindex edit inside the /* block', () => {
    const sedExpr = /sed -i '([^']+)' dist\/_headers/.exec(read('.github/workflows/deploy.yml'))![1]!;
    const file = join(mkdtempSync(join(tmpdir(), 'headers-')), '_headers');
    writeFileSync(file, read('public/_headers'));
    execFileSync('sed', ['-i', sedExpr, file]);
    const after = parse(readFileSync(file, 'utf8'));
    expect(after.get('/*')).toContain('X-Robots-Tag: noindex');
    expect(after.get('/*')).toContain('X-Frame-Options: DENY');
    expect([...after.values()].flat().filter((h) => h.startsWith('X-Robots-Tag'))).toHaveLength(1);
  });
});
