// Local persistence. v0 uses localStorage; the interface lets us swap in IndexedDB later.
// Each game mode keeps its own learner model under its own key.

import { type Engine, type StudentState, nameEngine } from './engine';
import type { Clef } from './music';
import { type ThemeId, isThemeId } from './themes';

const STATE_KEY = 'nrp:v1:state';
const SETTINGS_KEY = 'nrp:v1:settings';

export type ModeId = 'name' | 'letters';

export interface Settings {
  clefs: Clef[];
  muted: boolean;
  /** Game mode chosen on the home screen; absent = Name It. */
  mode?: ModeId;
  /** Visual theme; missing = the default theme. */
  theme?: ThemeId;
}

export const DEFAULT_SETTINGS: Settings = { clefs: ['treble'], muted: false };

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Name It keeps the original key so existing progress loads unchanged. */
export function stateKey(engine: Engine): string {
  return engine.set.id === 'name' ? STATE_KEY : `${STATE_KEY}:${engine.set.id}`;
}

function readJson<T>(store: KeyValueStore, key: string): T | null {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function loadState(store: KeyValueStore, engine: Engine = nameEngine): StudentState {
  const saved = readJson<StudentState>(store, stateKey(engine));
  return saved?.version === 1 ? engine.normalize(saved) : engine.newStudent();
}

export function saveState(store: KeyValueStore, state: StudentState, engine: Engine = nameEngine): void {
  try {
    store.setItem(stateKey(engine), JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode): keep playing; progress just won't persist.
  }
}

export function clearState(store: KeyValueStore, engine: Engine = nameEngine): void {
  store.removeItem(stateKey(engine));
}

export function loadSettings(store: KeyValueStore): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(store, SETTINGS_KEY) };
  if (!isThemeId(settings.theme)) delete settings.theme; // e.g. a theme that was removed
  return settings;
}

export function saveSettings(store: KeyValueStore, settings: Settings): void {
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore; see saveState.
  }
}

/** Ask the browser not to evict our data (matters on iPad Safari; see design §6). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
