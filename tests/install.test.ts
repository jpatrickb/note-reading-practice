import { describe, expect, it } from 'vitest';
import {
  TIP_SNOOZE_MS,
  UPDATE_CHECK_MS,
  canApplyUpdateNow,
  durability,
  installTip,
  parseDismissedAt,
  updateCheckDue,
} from '../src/core/install';
import { DAY, T0 } from './helpers';

const base = { ios: false, standalone: false, canPrompt: false, dismissedAt: null, now: T0 };

describe('installTip', () => {
  it('shows Share → Add to Home Screen help on iPad/iPhone', () => {
    expect(installTip({ ...base, ios: true })).toBe('ios');
  });

  it('offers the install button only when Chromium gave us a prompt', () => {
    expect(installTip(base)).toBeNull();
    expect(installTip({ ...base, canPrompt: true })).toBe('prompt');
  });

  it('is hidden once installed', () => {
    expect(installTip({ ...base, ios: true, standalone: true })).toBeNull();
    expect(installTip({ ...base, canPrompt: true, standalone: true })).toBeNull();
  });

  it('stays hidden after "Not now" for the snooze period, then comes back', () => {
    const env = { ...base, ios: true, dismissedAt: T0 };
    expect(installTip({ ...env, now: T0 + DAY })).toBeNull();
    expect(installTip({ ...env, now: T0 + TIP_SNOOZE_MS - 1 })).toBeNull();
    expect(installTip({ ...env, now: T0 + TIP_SNOOZE_MS })).toBe('ios');
  });
});

describe('parseDismissedAt', () => {
  it('reads a stored timestamp and ignores junk', () => {
    expect(parseDismissedAt(String(T0))).toBe(T0);
    expect(parseDismissedAt(null)).toBeNull();
    expect(parseDismissedAt('')).toBeNull();
    expect(parseDismissedAt('soon')).toBeNull();
    expect(parseDismissedAt('-5')).toBeNull();
  });
});

describe('durability', () => {
  it('reassures when the browser promised to keep the data', () => {
    for (const ios of [true, false]) {
      const d = durability({ persisted: true, ios, standalone: false });
      expect(d.level).toBe('safe');
      expect(d.text).toContain('This device will keep your progress');
      expect(d.suggestInstall).toBe(false);
    }
  });

  it('counts a Home Screen app on iPad as safe even if persisted() says no', () => {
    expect(durability({ persisted: false, ios: true, standalone: true }).level).toBe('safe');
  });

  it('warns iPad Safari users and nudges them to install', () => {
    for (const persisted of [false, null]) {
      const d = durability({ persisted, ios: true, standalone: false });
      expect(d.level).toBe('risk');
      expect(d.text).toMatch(/Home Screen/);
      expect(d.text).toMatch(/progress code/);
      expect(d.suggestInstall).toBe(true);
    }
  });

  it('suggests a progress-code backup elsewhere', () => {
    const d = durability({ persisted: null, ios: false, standalone: false });
    expect(d.level).toBe('unknown');
    expect(d.text).toMatch(/progress code/);
    expect(d.suggestInstall).toBe(false);
  });
});

describe('update timing', () => {
  it('checks for a new version at most hourly', () => {
    expect(updateCheckDue(T0, T0 + UPDATE_CHECK_MS - 1)).toBe(false);
    expect(updateCheckDue(T0, T0 + UPDATE_CHECK_MS)).toBe(true);
  });

  it('applies a waiting version by itself only on an untouched home screen', () => {
    expect(canApplyUpdateNow('home', false)).toBe(true);
    expect(canApplyUpdateNow('home', true)).toBe(false);
    expect(canApplyUpdateNow('play', false)).toBe(false);
    expect(canApplyUpdateNow('summary', false)).toBe(false);
    expect(canApplyUpdateNow(undefined, false)).toBe(false);
  });
});
