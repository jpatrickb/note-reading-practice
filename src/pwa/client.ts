// Page-side PWA glue: service worker registration and updates, and Chromium's install prompt.
// Everything here is best-effort. If service workers are missing or registration fails, the app
// simply works online as before.

import { canApplyUpdateNow, updateCheckDue } from '../core/install';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let waiting: ServiceWorker | null = null;
let installEvent: BeforeInstallPromptEvent | null = null;
let interacted = false;
let reloading = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

/** Live PWA state for the UI. */
export const pwa = {
  /** A new version has downloaded and is waiting for the kid to tap "refresh". */
  get updateReady(): boolean {
    return waiting !== null;
  },
  /** Chromium offered to install the app (`beforeinstallprompt`). */
  get canPrompt(): boolean {
    return installEvent !== null;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Show the browser's install dialog. Resolves true if the app was installed. */
  async promptInstall(): Promise<boolean> {
    const e = installEvent;
    if (!e) return false;
    installEvent = null; // a prompt event can only be used once
    emit();
    try {
      await e.prompt();
      return (await e.userChoice).outcome === 'accepted';
    } catch {
      return false;
    }
  },
  /** Switch to the waiting version and reload. Only called from a kid's tap (or at launch). */
  applyUpdate(): void {
    const w = waiting;
    if (!w || reloading) return;
    reloading = true;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
    w.postMessage('skip-waiting');
    // If the switch somehow doesn't happen, reload anyway: the kid asked for it.
    window.setTimeout(() => location.reload(), 3000);
  },
};

function setWaiting(w: ServiceWorker, screen: () => string | undefined): void {
  waiting = w;
  if (canApplyUpdateNow(screen(), interacted)) pwa.applyUpdate();
  else emit();
}

async function registerServiceWorker(screen: () => string | undefined): Promise<void> {
  const sw = navigator.serviceWorker;
  // updateViaCache 'none': the browser always revalidates sw.js itself (belt and braces with _headers).
  const reg = await sw.register('./sw.js', { scope: './', updateViaCache: 'none' });
  const track = (w: ServiceWorker | null) => {
    if (!w) return;
    const check = () => {
      // "installed" with an existing controller = an update (not the very first install).
      if (w.state === 'installed' && sw.controller) setWaiting(w, screen);
    };
    w.addEventListener('statechange', check);
    check();
  };
  // Downloaded during an earlier visit: apply now if the kid hasn't started, else offer it.
  if (reg.waiting && sw.controller) setWaiting(reg.waiting, screen);
  track(reg.installing);
  reg.addEventListener('updatefound', () => track(reg.installing));

  // An installed app on iPad resumes from the background without reloading, so the browser's own
  // update check (on navigation) may not run for days. Check when it comes back into view.
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !updateCheckDue(lastCheck, Date.now())) return;
    lastCheck = Date.now();
    reg.update().catch(() => {});
  });
}

/** Start the PWA features. `screen` reports the current screen (the update waits for "home"). */
export function startPwa(screen: () => string | undefined): void {
  const touched = () => (interacted = true);
  document.addEventListener('pointerdown', touched, { capture: true, once: true });
  document.addEventListener('keydown', touched, { capture: true, once: true });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own, dismissible button instead of the browser's mini-bar
    installEvent = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    emit();
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  registerServiceWorker(screen).catch(() => {
    // No offline support this time (private mode, blocked, or an error); online play is unaffected.
  });
}
