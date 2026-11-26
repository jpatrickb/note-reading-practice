// @vitest-environment jsdom
// The mode registry, per-mode profile storage and settings: everything that makes "adding a mode"
// one registration. Also the migration from today's storage keys and settings (issue #20).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Synth } from '../src/audio/synth';
import { decodeProfile, encodeProfile } from '../src/core/codec';
import { type StudentState, level } from '../src/core/engine';
import { ITEMS } from '../src/core/items';
import { CORE_MODES, type CoreMode, coreMode } from '../src/core/modes';
import { isFinished, nextQuestion, startSession, submit } from '../src/core/session';
import {
  DEFAULT_SETTINGS,
  type KeyValueStore,
  clearProfile,
  lanesFor,
  loadProfile,
  loadSettings,
  loadState,
  saveProfile,
  saveSettings,
  setLanes,
  stateKey,
} from '../src/core/storage';
import { h } from '../src/ui/dom';
import { MODE_GROUPS, type UiMode, defineMode, hasProgress, medalCounts } from '../src/ui/mode';
import { renderModeChooser } from '../src/ui/modeChooser';
import { MODES, lockedDemoMode, modeById, registeredModes } from '../src/ui/modes';
import { MOVE_MODE } from './fixtures/moves';
import { DAY, T0, seededRng } from './helpers';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

function play(mode: CoreMode, state: StudentState, start: number, questions = 40): number {
  const { engine } = mode;
  const session = startSession(Object.keys(engine.set.groups), questions, { engine });
  const rng = seededRng(11);
  let now = start;
  while (!isFinished(session)) {
    const q = nextQuestion(session, state, now, rng);
    submit(session, state, engine.answerOf(q.itemId), now + 1500);
    now += 15 * 60_000;
  }
  return now;
}

/** A third mode, standing in for the next one to be registered. */
const MOVES_CORE: CoreMode = { id: 'moves', tag: 3, engine: MOVE_MODE.engine };

describe('the core mode registry', () => {
  it('gives every mode a distinct id, a permanent tag, and an engine of the same id', () => {
    expect(new Set(CORE_MODES.map((m) => m.id)).size).toBe(CORE_MODES.length);
    expect(new Set(CORE_MODES.map((m) => m.tag)).size).toBe(CORE_MODES.length);
    for (const m of CORE_MODES) {
      expect(m.tag, m.id).toBeGreaterThanOrEqual(1);
      expect(m.tag, m.id).toBeLessThanOrEqual(255);
      // The storage key is built from the engine's set id, so the two must agree.
      expect(m.engine.set.id, m.id).toBe(m.id);
    }
    expect(new Set(CORE_MODES.map((m) => stateKey(m.engine))).size).toBe(CORE_MODES.length);
  });

  it('pins the tags of the shipped modes (they are written into every progress code)', () => {
    expect(CORE_MODES.map((m) => [m.id, m.tag])).toEqual([
      ['name', 1],
      ['letters', 2],
      ['place', 3],
      ['catch', 4],
      ['k2s', 6],
      ['words', 7],
    ]);
  });

  it('looks a mode up by id, and throws on an unknown one', () => {
    expect(coreMode('letters').tag).toBe(2);
    expect(() => coreMode('nope')).toThrow(/Unknown mode/);
  });
});

describe('profile storage', () => {
  it('saves and loads every registered mode under its own key, Name It on the legacy key', () => {
    const store = memoryStore();
    const profile = loadProfile(store, [...CORE_MODES, MOVES_CORE]);
    for (const m of [...CORE_MODES, MOVES_CORE]) play(m, profile[m.id]!, T0, 20);
    saveProfile(store, profile, [...CORE_MODES, MOVES_CORE]);
    expect([...store.data.keys()].sort()).toEqual(['nrp:v1:state', 'nrp:v1:state:catch', 'nrp:v1:state:k2s', 'nrp:v1:state:letters', 'nrp:v1:state:moves', 'nrp:v1:state:place', 'nrp:v1:state:words']);

    const back = loadProfile(store, [...CORE_MODES, MOVES_CORE]);
    for (const m of [...CORE_MODES, MOVES_CORE]) expect(back[m.id], m.id).toEqual(profile[m.id]);
  });

  it('a mode that was never saved loads fresh', () => {
    const store = memoryStore();
    const profile = loadProfile(store);
    for (const m of CORE_MODES) expect(profile[m.id]).toEqual(m.engine.newStudent());
  });

  it('saveProfile skips modes that have no state, and clearProfile removes every key', () => {
    const store = memoryStore();
    saveProfile(store, { name: CORE_MODES[0]!.engine.newStudent() });
    expect([...store.data.keys()]).toEqual(['nrp:v1:state']);
    saveProfile(store, loadProfile(store));
    expect(store.data.size).toBe(CORE_MODES.length);
    clearProfile(store);
    expect(store.data.size).toBe(0);
  });

  it('one mode with a corrupt save does not disturb the others', () => {
    const store = memoryStore();
    const profile = loadProfile(store);
    play(CORE_MODES[0]!, profile.name, T0, 20);
    saveProfile(store, profile);
    store.setItem('nrp:v1:state:letters', '{not json');
    const back = loadProfile(store);
    expect(back.name).toEqual(profile.name);
    expect(back.letters).toEqual(CORE_MODES[1]!.engine.newStudent());
  });

  it('a profile exported after playing every mode imports with both restored (the code round trip)', () => {
    const profile = loadProfile(memoryStore());
    let now = play(coreMode('name'), profile.name, T0 - 3 * DAY, 30);
    now = play(coreMode('letters'), profile.letters, now, 30);
    now = play(coreMode('place'), profile.place!, now, 30);
    now = play(coreMode('catch'), profile.catch!, now, 30);
    now = play(coreMode('k2s'), profile.k2s!, now, 30);
    now = play(coreMode('words'), profile.words!, now, 30);
    const code = encodeProfile(profile, now);

    const restored = decodeProfile(code, now);
    const store = memoryStore();
    saveProfile(store, restored);
    const back = loadProfile(store);
    for (const m of CORE_MODES) {
      const before = profile[m.id]!;
      const after = back[m.id]!;
      expect(hasProgress(after), m.id).toBe(true);
      expect(medalCounts(after), m.id).toEqual(medalCounts(before));
      for (const item of m.engine.set.items) {
        expect(after.items[item.id]!.unlocked, item.id).toBe(before.items[item.id]!.unlocked);
        expect(level(after.items[item.id]!), item.id).toBe(level(before.items[item.id]!));
      }
    }
  });
});

describe('migration from today\'s storage keys and settings', () => {
  // What a kid's iPad holds today: Name It on the unsuffixed key, Letter Math on `:letters`, and the
  // settings written by the segmented-control build (`mode` is "letters", or absent for Name It).
  function todaysStorage(settings: object) {
    const store = memoryStore();
    const name = CORE_MODES[0]!.engine.newStudent();
    const letters = CORE_MODES[1]!.engine.newStudent();
    play(CORE_MODES[0]!, name, T0, 30);
    play(CORE_MODES[1]!, letters, T0, 30);
    store.setItem('nrp:v1:state', JSON.stringify(name));
    store.setItem('nrp:v1:state:letters', JSON.stringify(letters));
    store.setItem('nrp:v1:settings', JSON.stringify(settings));
    return { store, name, letters };
  }

  it('loads the same learner models from the same keys', () => {
    const { store, name, letters } = todaysStorage({ clefs: ['treble', 'bass'], muted: false, mode: 'letters' });
    const profile = loadProfile(store);
    expect(profile.name).toEqual(name);
    expect(profile.letters).toEqual(letters);
    // Saving again keeps today's keys; a mode added since (never played) is only written fresh.
    const keys = new Set(store.data.keys());
    saveProfile(store, profile);
    for (const k of keys) expect(store.data.has(k), k).toBe(true);
    for (const k of store.data.keys()) if (!keys.has(k)) expect(JSON.parse(store.data.get(k)!), k).toEqual(CORE_MODES.find((m) => k.endsWith(`:${m.id}`))!.engine.newStudent());
    expect(JSON.parse(store.data.get('nrp:v1:state')!)).toEqual(name);
  });

  it('keeps every setting of a build that had only { mode: "letters" }', () => {
    const { store } = todaysStorage({ clefs: ['bass'], muted: true, mode: 'letters', theme: 'ocean', calm: true });
    const settings = loadSettings(store);
    expect(settings).toEqual({ clefs: ['bass'], muted: true, mode: 'letters', theme: 'ocean', calm: true });
    // Both modes read the one clef choice there was.
    expect(lanesFor(settings, 'name')).toEqual(['bass']);
    expect(lanesFor(settings, 'letters')).toEqual(['bass']);
  });

  it('treats settings without a mode as Name It', () => {
    expect(loadSettings(todaysStorage({ clefs: ['treble'], muted: false }).store).mode).toBeUndefined();
    expect(modeById(MODES, undefined).id).toBe('name');
  });

  it('settings with only { mode: "letters" } load with the defaults filled in', () => {
    const store = memoryStore();
    store.setItem('nrp:v1:settings', JSON.stringify({ mode: 'letters' }));
    expect(loadSettings(store)).toEqual({ ...DEFAULT_SETTINGS, mode: 'letters' });
  });

  it('no settings at all load the defaults', () => {
    expect(loadSettings(memoryStore())).toEqual(DEFAULT_SETTINGS);
  });

  it('an unknown mode id falls back to Name It', () => {
    const store = memoryStore();
    store.setItem('nrp:v1:settings', JSON.stringify({ clefs: ['treble'], muted: false, mode: 'from-the-future' }));
    expect(loadSettings(store).mode).toBeUndefined();
    expect(modeById(MODES, 'from-the-future').id).toBe('name');
    store.setItem('nrp:v1:settings', JSON.stringify({ mode: 7 }));
    expect(loadSettings(store).mode).toBeUndefined();
  });

  it('a mode registered later is a known mode', () => {
    const store = memoryStore();
    store.setItem('nrp:v1:settings', JSON.stringify({ mode: 'moves' }));
    expect(loadSettings(store).mode).toBeUndefined();
    expect(loadSettings(store, [...CORE_MODES, MOVES_CORE]).mode).toBe('moves');
  });

  it('repairs malformed settings instead of crashing', () => {
    const store = memoryStore();
    for (const raw of ['{oops', 'null', '[]', '7', '"x"']) {
      store.setItem('nrp:v1:settings', raw);
      expect(loadSettings(store), raw).toEqual(DEFAULT_SETTINGS);
    }
    store.setItem('nrp:v1:settings', JSON.stringify({ clefs: [], muted: 'yes', theme: 'glitter', calm: 1, lanes: [1] }));
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    store.setItem('nrp:v1:settings', JSON.stringify({ clefs: 'bass' }));
    expect(loadSettings(store).clefs).toEqual(['treble']);
  });
});

describe('per-mode clef choice', () => {
  it('remembers each mode\'s clefs, and a mode with no choice follows the last one made', () => {
    const settings = { ...DEFAULT_SETTINGS };
    expect(lanesFor(settings, 'name')).toEqual(['treble']);
    setLanes(settings, 'name', ['bass']);
    expect(settings.clefs).toEqual(['bass']);
    expect(lanesFor(settings, 'name')).toEqual(['bass']);
    expect(lanesFor(settings, 'place')).toEqual(['bass']); // no choice yet: the last one
    setLanes(settings, 'place', ['treble', 'bass']);
    expect(lanesFor(settings, 'place')).toEqual(['treble', 'bass']);
    expect(lanesFor(settings, 'name')).toEqual(['bass']); // unchanged
  });

  it('survives a save and a load, and drops bad entries', () => {
    const store = memoryStore();
    const settings = { ...DEFAULT_SETTINGS };
    setLanes(settings, 'name', ['bass', 'treble', 'bass']);
    setLanes(settings, 'place', ['treble']);
    saveSettings(store, settings);
    const back = loadSettings(store);
    expect(back.lanes).toEqual({ name: ['treble', 'bass'], place: ['treble'] });
    store.setItem('nrp:v1:settings', JSON.stringify({ ...back, lanes: { name: ['alto'], place: 'bass', x: ['bass'] } }));
    expect(loadSettings(store).lanes).toEqual({ x: ['bass'] });
    expect(setLanes(settings, 'name', []), 'an empty choice falls back to treble').toBeUndefined();
    expect(lanesFor(settings, 'name')).toEqual(['treble']);
  });
});

describe('legacy saves of a mode still load when read through loadState', () => {
  it('reads Name It from the original key', () => {
    const store = memoryStore();
    const name = CORE_MODES[0]!.engine.newStudent();
    name.items['name:treble:G4']!.n = 5;
    store.setItem('nrp:v1:state', JSON.stringify(name));
    expect(loadState(store).items['name:treble:G4']!.n).toBe(5);
  });
});

// ───────────────────────── the UI registry ─────────────────────────

describe('the UI mode registry', () => {
  const profile = () => loadProfile(memoryStore());
  /** A profile whose every Name It note is silver, for modes that build on Name It (made up). */
  const silverProfile = () => {
    const p = profile();
    for (const i of ITEMS) Object.assign(p.name.items[i.id]!, { unlocked: true, best: 1, n: 6, c: 6 });
    return p;
  };

  it('registers every mode, each backed by a core mode', () => {
    expect(MODES.map((m) => m.id)).toEqual(['name', 'letters', 'place', 'catch', 'k2s', 'words']);
    for (const m of MODES) {
      expect(m.core, m.id).toBe(coreMode(m.id));
      expect(m.session.engine, m.id).toBe(m.core.engine);
    }
  });

  it('ids are unique, and every shipped core mode has a UI entry', () => {
    expect(new Set(MODES.map((m) => m.id)).size).toBe(MODES.length);
    for (const c of CORE_MODES) expect(MODES.map((m) => m.id), `core mode "${c.id}" has no UI entry in src/ui/modes.ts`).toContain(c.id);
  });

  it.each(MODES.map((m) => [m.id, m] as const))('%s: kid-friendly card text and a working set of hooks', (_id, m) => {
    expect(m.title.length).toBeGreaterThan(0);
    expect(m.title.length).toBeLessThanOrEqual(16);
    expect(m.blurb.split(/\s+/).length, `"${m.blurb}" is more than 8 words`).toBeLessThanOrEqual(8);
    expect(MODE_GROUPS.map((g) => g.id)).toContain(m.group);
    const state = m.core.engine.newStudent();
    // Open from the start, except a mode that builds on another (Word Decoder needs Name It notes).
    expect(m.availability(profile())).toEqual(m.id === 'words' ? { ok: false, reason: 'Learn a few more notes in Name It first!' } : { ok: true });
    expect(m.counts(state)).toEqual({ gold: 0, silver: 0 });
    for (const item of m.core.engine.set.items.slice(0, 40)) expect(m.itemLabel(item.id).length, item.id).toBeGreaterThan(0);
    expect(m.groups(['treble'], silverProfile()).length).toBeGreaterThan(0);
    for (const g of m.groups(['treble', 'bass'], silverProfile())) expect(Object.keys(m.core.engine.set.groups), g).toContain(g);
    // Both the summary form and the My progress form draw.
    expect(m.renderMap(state, T0)).toBeInstanceOf(HTMLElement);
    expect(m.renderMap(state, T0, { legend: true, lanes: ['bass'] })).toBeInstanceOf(HTMLElement);
    expect(m.words.item.length).toBeGreaterThan(0);
  });

  it('only clef modes offer the clef picker, and Letter Math plays its one lane whatever the clef', () => {
    expect(modeById(MODES, 'name').lanes).toBe('clefs');
    expect(modeById(MODES, 'name').groups(['bass'])).toEqual(['bass']);
    expect(modeById(MODES, 'name').groups(['treble', 'bass'])).toEqual(['treble', 'bass']);
    expect(modeById(MODES, 'letters').lanes).toBeNull();
    expect(modeById(MODES, 'letters').groups(['bass'])).toEqual(['letters']);
  });

  it('plays: createPlay builds a screen that asks a question', () => {
    for (const m of MODES) {
      const session = startSession(m.groups(['treble'], silverProfile()), 3, m.session);
      const state = m.core.engine.newStudent();
      const host = {
        session,
        state,
        now: () => T0,
        save: vi.fn(),
        announce: vi.fn(),
        muteButton: () => h('button', {}, 'mute'),
        quit: vi.fn(),
        finish: vi.fn(),
        stopSound: vi.fn(),
      };
      const shell = m.createPlay(host, { synth: { note: vi.fn(), stopAll: vi.fn() } as unknown as Synth, profile: silverProfile() });
      document.body.append(shell.render());
      shell.dispose();
      expect(host.stopSound, `${m.id} stops sound when its screen closes`).toHaveBeenCalled();
      document.body.replaceChildren();
    }
  });

  it('the test-only locked mode exists only behind debug, and is locked with a reason', () => {
    expect(registeredModes().map((m) => m.id)).toEqual(['name', 'letters', 'place', 'catch', 'k2s', 'words']);
    expect(registeredModes(true).map((m) => m.id)).toEqual(['name', 'letters', 'place', 'catch', 'k2s', 'words', 'demo-locked']);
    expect(lockedDemoMode.availability(profile())).toEqual({ ok: false, reason: 'Learn 7 notes in Name It first!' });
    expect(() => lockedDemoMode.createPlay({} as never, {} as never)).toThrow();
    // Its model is not a registered one: nothing about it is saved or put in a code.
    expect(CORE_MODES.map((m) => m.id)).not.toContain(lockedDemoMode.core.id);
    expect(lockedDemoMode.renderMap(CORE_MODES[0]!.engine.newStudent(), T0)).toBeInstanceOf(HTMLElement);
  });

  it('defineMode fills in defaults for everything optional', () => {
    const m = defineMode({
      id: 'moves',
      title: 'Moves',
      icon: 'note',
      blurb: 'Step, skip or leap?',
      group: 'ear',
      core: MOVES_CORE,
      words: { item: 'melody', medal: '', encourage: 'Keep going!' },
      createPlay: () => {
        throw new Error('not built');
      },
      renderMap: () => h('div'),
    });
    expect(m.lanes).toBeNull();
    expect(m.groups(['treble'])).toEqual(['a', 'b']); // every lane of its item set
    expect(m.itemLabel('mv:a:0:1')).toBe('mv:a:0:1');
    expect(m.availability(profile())).toEqual({ ok: true });
    expect(m.session.engine).toBe(MOVES_CORE.engine);
    expect(m.counts(MOVES_CORE.engine.newStudent())).toEqual({ gold: 0, silver: 0 });
  });
});

// ───────────────────────── the home chooser ─────────────────────────

describe('the home mode chooser', () => {
  beforeEach(() => document.body.replaceChildren());

  const sample = (id: string, group: UiMode['group'], locked = false): UiMode =>
    defineMode({
      id,
      title: `Mode ${id}`,
      icon: 'note',
      blurb: `Blurb ${id}`,
      group,
      core: { id, tag: 40, engine: MOVES_CORE.engine },
      words: { item: 'item', medal: '', encourage: '' },
      createPlay: () => {
        throw new Error('x');
      },
      renderMap: () => h('div'),
      availability: () => (locked ? { ok: false, reason: `Reason for ${id}` } : { ok: true }),
    });

  const render = (modes: readonly UiMode[], selected: string, onSelect = vi.fn()) => {
    const el = renderModeChooser({ modes, profile: loadProfile(memoryStore()), selected, onSelect });
    document.body.append(el);
    return { el, onSelect };
  };
  const card = (id: string) => document.querySelector<HTMLButtonElement>(`[data-mode="${id}"]`)!;

  it('shows a card per mode, grouped under headings in the fixed order, hiding empty groups', () => {
    render(MODES, 'name');
    expect([...document.querySelectorAll('.mode-group__title')].map((e) => e.textContent)).toEqual(['Read notes', 'Find keys', 'Alphabet & theory']);
    expect(card('name').textContent).toContain('Name It');
    expect(card('name').textContent).toContain('Read the note, tap its name');
    expect(card('letters').textContent).toContain('Next letter, skips and intervals');
  });

  it('marks the chosen card with aria-checked and a check, not by color alone', () => {
    render(MODES, 'letters');
    expect(card('letters').getAttribute('aria-checked')).toBe('true');
    expect(card('letters').querySelector('.icon--check')).not.toBeNull();
    expect(card('name').getAttribute('aria-checked')).toBe('false');
    expect(card('name').querySelector('.icon--check')).toBeNull();
  });

  it('choosing a card reports it', () => {
    const { onSelect } = render(MODES, 'name');
    card('letters').click();
    expect(onSelect).toHaveBeenCalledWith('letters');
  });

  it('is one radio group with a single tab stop, and arrow keys move through the open cards', () => {
    const { el, onSelect } = render([...MODES.filter((m) => m.id !== 'catch' && m.id !== 'k2s' && m.id !== 'words'), sample('lock', 'music', true)], 'name');
    expect(el.getAttribute('role')).toBe('radiogroup');
    expect(el.getAttribute('aria-label')).toBe('Game');
    expect(document.querySelectorAll('.mode-card[role="radio"]')).toHaveLength(4);
    expect([...document.querySelectorAll('.mode-card')].filter((c) => c.getAttribute('tabindex') === '0').map((c) => (c as HTMLElement).dataset.mode)).toEqual(['name']);

    const press = (key: string) => card('name').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    card('name').focus();
    // Cards sit in their home groups: Name It, Place It (Read notes), Letter Math, then the locked one.
    press('ArrowRight');
    expect(onSelect).toHaveBeenLastCalledWith('place');
    press('ArrowLeft'); // wraps past the locked card back to the last open one
    expect(onSelect).toHaveBeenLastCalledWith('letters');
    press('ArrowDown');
    expect(onSelect).toHaveBeenLastCalledWith('place');
    press('ArrowUp');
    expect(onSelect).toHaveBeenLastCalledWith('letters');
    onSelect.mockClear();
    press('a');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a locked mode stays visible with its reason, is announced as disabled, and cannot be chosen', () => {
    const { onSelect } = render([...MODES, sample('lock', 'music', true)], 'name');
    const locked = card('lock');
    expect(locked.textContent).toContain('Reason for lock');
    expect(locked.textContent).not.toContain('Blurb lock');
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(locked.getAttribute('aria-describedby')).toBe(locked.querySelector('.mode-card__reason')!.id);
    expect(locked.querySelector('.icon--lock')).not.toBeNull();
    expect(locked.hasAttribute('disabled')).toBe(false); // stays focusable (D75)
    locked.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('scales to a dozen modes across every group', () => {
    const modes: UiMode[] = [...MODES];
    MODE_GROUPS.forEach((g, gi) => {
      for (let i = 0; i < 2; i++) modes.push(sample(`${g.id}${i}`, g.id, i === 1 && gi % 2 === 0));
    });
    expect(modes.length).toBeGreaterThanOrEqual(12);
    render(modes, 'name');
    expect(document.querySelectorAll('.mode-card')).toHaveLength(modes.length);
    expect(document.querySelectorAll('.mode-group')).toHaveLength(MODE_GROUPS.length);
    expect(document.querySelectorAll('.mode-card--locked').length).toBeGreaterThan(0);
    // Exactly one card is chosen.
    expect(document.querySelectorAll('.mode-card[aria-checked="true"]')).toHaveLength(1);
  });
});
