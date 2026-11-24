// Pure decisions behind the install tip, the storage-durability message, and the update flow.
// The browser-facing glue lives in src/pwa/ and src/ui/pwa.ts; this file has no DOM access.

const DAY = 86_400_000;

/** After "Not now", the install tip stays hidden this long. It matters too much to hide forever. */
export const TIP_SNOOZE_MS = 30 * DAY;
/** An installed app on iPad can stay open (suspended) for days, so it checks for updates itself. */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;

export interface InstallEnv {
  /** iPhone/iPad (any browser there is Safari underneath). */
  ios: boolean;
  /** Already running as an installed app. */
  standalone: boolean;
  /** Chromium offered a `beforeinstallprompt` we can show. */
  canPrompt: boolean;
  /** When the kid last dismissed the tip (ms), or null. */
  dismissedAt: number | null;
  now: number;
}

export type InstallTip = 'ios' | 'prompt' | null;

/** Which install tip to show on the home screen, if any. */
export function installTip(env: InstallEnv): InstallTip {
  if (env.standalone) return null;
  if (env.dismissedAt !== null && env.now - env.dismissedAt < TIP_SNOOZE_MS) return null;
  if (env.ios) return 'ios';
  return env.canPrompt ? 'prompt' : null;
}

/** Parse a stored timestamp; anything unreadable counts as "never dismissed". */
export function parseDismissedAt(raw: string | null): number | null {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : null;
}

export interface DurabilityEnv {
  /** Result of `navigator.storage.persisted()`; null when the browser can't tell us. */
  persisted: boolean | null;
  ios: boolean;
  standalone: boolean;
}

export interface Durability {
  /** safe: the browser promised to keep it. risk: Safari may delete it. unknown: probably fine. */
  level: 'safe' | 'risk' | 'unknown';
  text: string;
  /** Show "how to install" help next to the message. */
  suggestInstall: boolean;
}

/** Kid-friendly words for how safe the progress on this device is. */
export function durability(env: DurabilityEnv): Durability {
  if (env.persisted) return { level: 'safe', text: '✅ This device will keep your progress.', suggestInstall: false };
  if (env.ios && env.standalone) {
    // Home Screen apps are exempt from Safari's 7-day cleanup even when persisted() says false.
    return { level: 'safe', text: '✅ Note Reader is on your Home Screen, so this device will keep your progress.', suggestInstall: false };
  }
  if (env.ios) {
    return {
      level: 'risk',
      text: '⚠️ Safari may erase your progress if you don’t play for a week. Add Note Reader to your Home Screen to keep it safe, and save your progress code as a backup.',
      suggestInstall: true,
    };
  }
  return {
    level: 'unknown',
    text: '💾 Your progress is saved in this browser. Clearing the browser’s data would erase it, so keep a copy of your progress code.',
    suggestInstall: false,
  };
}

/** Whether it's time to ask the server for a new version again. */
export function updateCheckDue(lastCheck: number, now: number): boolean {
  return now - lastCheck >= UPDATE_CHECK_MS;
}

/**
 * A new version that finished downloading while the app was closed may be applied right at launch,
 * but only before the kid has touched anything, and never outside the home screen.
 */
export function canApplyUpdateNow(screen: string | undefined, interacted: boolean): boolean {
  return screen === 'home' && !interacted;
}
