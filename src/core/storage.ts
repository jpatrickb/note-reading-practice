// Local persistence. v0 uses localStorage; the interface lets us swap in IndexedDB later.
// Each game mode keeps its own learner model under its own key (`nrp:v1:state[:<mode id>]`; Name It
// keeps the original, unsuffixed key so progress saved before there were modes still loads).

import type { Profile } from './codec';
import { type Engine, type StudentState, nameEngine } from './engine';
import { CORE_MODES, type CoreMode } from './modes';
import type { Clef } from './music';
import { type ThemeId, isThemeId } from './themes';

const STATE_KEY = 'nrp:v1:state';
const SETTINGS_KEY = 'nrp:v1:settings';

/** A game mode's id (`CoreMode.id`): 'name', 'letters', ... */
export type ModeId = string;

export const DEFAULT_MODE: ModeId = 'name';

export interface Settings {
  /**
   * The clefs last chosen. Name It's own choice (from before modes had their own) and the default
   * for any other mode that has clef lanes; see `lanesFor`.
   */
  clefs: Clef[];
  muted: boolean;
  /** Game mode chosen on the home screen; absent (or no longer a known mode) = Name It. */
  mode?: ModeId;
  /** Per-mode lane choice (clefs), by mode id; a mode without an entry uses `clefs`. */
  lanes?: Record<ModeId, Clef[]>;
  /** Visual theme; missing = the default theme. */
  theme?: ThemeId;
  /** Calm mode: no ambient motion, small celebrations. Missing = off (the OS reduced-motion setting also turns it on). */
  calm?: boolean;
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

/** A saved learner model, repaired so it can never crash the game (see `Engine.normalize`); fresh if there is none or it is unusable. */
export function loadState(store: KeyValueStore, engine: Engine = nameEngine): StudentState {
  const saved = readJson<StudentState>(store, stateKey(engine));
  // Version 1 (a save with no version but real items is a partial write of version 1).
  const usable = typeof saved === 'object' && saved !== null && (saved.version === 1 || (saved.version === undefined && typeof saved.items === 'object' && saved.items !== null));
  if (!usable) return engine.newStudent();
  try {
    return engine.normalize(saved);
  } catch {
    return engine.newStudent();
  }
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

// ───────────────────────────── the whole profile (every mode) ─────────────────────────────

/** Every mode's learner model, loaded (or fresh). */
export function loadProfile(store: KeyValueStore, modes: readonly CoreMode[] = CORE_MODES): Profile {
  const profile: Record<string, StudentState> = {};
  for (const m of modes) profile[m.id] = loadState(store, m.engine);
  return profile as Profile;
}

/** Save every mode in the profile (or only the listed ones). */
export function saveProfile(
  store: KeyValueStore,
  profile: Readonly<Record<string, StudentState | undefined>>,
  modes: readonly CoreMode[] = CORE_MODES,
): void {
  for (const m of modes) {
    const state = profile[m.id];
    if (state) saveState(store, state, m.engine);
  }
}

export function clearProfile(store: KeyValueStore, modes: readonly CoreMode[] = CORE_MODES): void {
  for (const m of modes) clearState(store, m.engine);
}

// ───────────────────────────── settings ─────────────────────────────

const CLEFS: readonly Clef[] = ['treble', 'bass'];

/** Valid clefs in canonical order, or null if there are none. */
function cleanClefs(value: unknown): Clef[] | null {
  if (!Array.isArray(value)) return null;
  const clefs = CLEFS.filter((c) => value.includes(c));
  return clefs.length > 0 ? clefs : null;
}

/**
 * Saved settings, repaired: a missing or malformed field takes its default, and a saved mode that is
 * not a known one (an old build's, or one this build no longer has) falls back to Name It.
 */
export function loadSettings(store: KeyValueStore, modes: readonly CoreMode[] = CORE_MODES): Settings {
  const saved = readJson<Record<string, unknown>>(store, SETTINGS_KEY);
  const raw = typeof saved === 'object' && saved !== null && !Array.isArray(saved) ? saved : {};
  const settings = { ...DEFAULT_SETTINGS, ...raw } as Settings;
  settings.clefs = cleanClefs(raw.clefs) ?? DEFAULT_SETTINGS.clefs;
  if (typeof settings.muted !== 'boolean') settings.muted = DEFAULT_SETTINGS.muted;
  if (typeof settings.mode !== 'string' || !modes.some((m) => m.id === settings.mode)) delete settings.mode;
  if (!isThemeId(settings.theme)) delete settings.theme; // e.g. a theme that was removed
  if (typeof settings.calm !== 'boolean') delete settings.calm;
  const lanes: Record<ModeId, Clef[]> = {};
  if (typeof raw.lanes === 'object' && raw.lanes !== null && !Array.isArray(raw.lanes)) {
    for (const [id, value] of Object.entries(raw.lanes)) {
      const clefs = cleanClefs(value);
      if (clefs) lanes[id] = clefs;
    }
  }
  if (Object.keys(lanes).length > 0) settings.lanes = lanes;
  else delete settings.lanes;
  return settings;
}

export function saveSettings(store: KeyValueStore, settings: Settings): void {
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore; see saveState.
  }
}

/** The clefs chosen for a mode: its own choice, else the clefs last chosen anywhere. */
export function lanesFor(settings: Settings, modeId: ModeId): Clef[] {
  return cleanClefs(settings.lanes?.[modeId]) ?? cleanClefs(settings.clefs) ?? DEFAULT_SETTINGS.clefs;
}

/** Remember a mode's clef choice (and make it the default for modes that have none yet). */
export function setLanes(settings: Settings, modeId: ModeId, clefs: readonly Clef[]): void {
  const clean = cleanClefs(clefs) ?? DEFAULT_SETTINGS.clefs;
  settings.lanes = { ...settings.lanes, [modeId]: clean };
  settings.clefs = clean;
}

/** Ask the browser not to evict our data (matters on iPad Safari; see design §6). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
