// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { THEMES } from '../src/core/themes';
import { BURST, MAX_PARTICLES, THEME_FX, correctBurst, flyKey, record, reducedFx } from '../src/ui/world/fx';
import { icon, medal } from '../src/ui/world/icons';
import { Journey } from '../src/ui/world/journey';
import { MASCOT_THEMES, MOOD_MS, renderMascot, setMood } from '../src/ui/world/mascots';
import { REACTION_MS } from '../src/ui/world/playChrome';
import { SCENES } from '../src/ui/world/scenes';
import { guardStaff, initWorld, renderWorld, setCalm, setWorldMode } from '../src/ui/world/world';

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.dataset.theme = 'ocean';
  document.documentElement.dataset.calm = 'false';
});

describe('every theme is a whole world', () => {
  it.each(THEMES.map((t) => t.id))('%s has a scene, a mascot and particle styling', (id) => {
    expect(SCENES[id]).toBeDefined();
    expect(MASCOT_THEMES).toContain(id);
    expect(THEME_FX[id]!.colors.length).toBeGreaterThan(1);
    const scene = SCENES[id]!;
    expect(scene.ground).toMatch(/<path|<rect/);
    // Ambient motion is a seasoning, not a feast: a handful of moving sprites, most of them in the sky.
    const moving = scene.sprites.filter((s) => s.move);
    expect(moving.length).toBeGreaterThan(0);
    expect(moving.length).toBeLessThanOrEqual(12);
    // No external images: all art is inline SVG.
    expect(JSON.stringify(scene)).not.toMatch(/https?:|url\((?!#)/);
  });
});

describe('world', () => {
  it('renders the theme behind the app and swaps on theme change', () => {
    initWorld(false);
    const world = document.querySelector<HTMLElement>('.world')!;
    expect(world.dataset.world).toBe('ocean');
    expect(world.getAttribute('aria-hidden')).toBe('true');
    expect(world.querySelector('.world__ground')).not.toBeNull();
    document.dispatchEvent(new CustomEvent('nrp:themechange', { detail: 'space' }));
    expect(world.dataset.world).toBe('space');
    renderWorld('space'); // no-op when unchanged
    expect(document.querySelectorAll('.world')).toHaveLength(1);
  });

  it('calm mode is a page-wide attribute', () => {
    setCalm(true);
    expect(document.documentElement.dataset.calm).toBe('true');
    expect(reducedFx()).toBe(true);
    setCalm(false);
    expect(reducedFx()).toBe(false);
  });

  it('pauses when the tab is hidden', () => {
    initWorld(false);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.documentElement.dataset.hidden).toBe('true');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.documentElement.dataset.hidden).toBeUndefined();
  });

  it('holds the ground still when it could pass behind the staff', () => {
    renderWorld('sunny');
    setWorldMode('play');
    const world = document.querySelector<HTMLElement>('.world')!;
    expect(world.dataset.mode).toBe('play');
    const card = document.createElement('div');
    // jsdom has no layout: every rect is 0×0 at the origin, i.e. "overlapping" → still.
    const rect = { top: -10, bottom: 300, left: 0, right: 500 };
    card.getBoundingClientRect = () => rect as DOMRect;
    guardStaff(card);
    expect(world.dataset.still).toBe('true');
    rect.top = 5000;
    rect.bottom = 5300;
    guardStaff(card);
    expect(world.dataset.still).toBeUndefined();
    setWorldMode('home');
    expect(world.dataset.mode).toBe('home');
  });
});

describe('mascots', () => {
  it('renders each mascot with a face rig and switches moods', () => {
    for (const id of MASCOT_THEMES) {
      const m = renderMascot(id, { mood: 'thinking', label: 'friend' });
      expect(m.dataset.mood).toBe('thinking');
      expect(m.getAttribute('role')).toBe('img');
      for (const part of ['.f-eyes--open', '.f-eyes--happy', '.f-mouth--open', '.f-mouth--soft', '.f-brows']) expect(m.querySelector(part), `${id} ${part}`).not.toBeNull();
    }
    expect(renderMascot('nope').className).toContain('mascot--sunny');
    expect(renderMascot('ocean').getAttribute('aria-hidden')).toBe('true');
  });

  it('a wrong answer’s reaction is shorter than a correct one’s, and both fit the pauses', () => {
    expect(MOOD_MS.encourage).toBeLessThan(MOOD_MS.happy);
    expect(REACTION_MS.wrong).toBeLessThan(REACTION_MS.correct);
    expect(REACTION_MS.correct).toBeLessThan(700);
    expect(MOOD_MS.cheer).toBeLessThan(1600);
  });

  it('setMood skips motion in calm mode but still changes the face', () => {
    const m = renderMascot('forest');
    let animated = 0;
    m.animate = (() => {
      animated++;
      return {} as Animation;
    }) as typeof m.animate;
    expect(setMood(m, 'happy')).toBe(MOOD_MS.happy);
    expect(animated).toBe(1);
    expect(setMood(m, 'thinking')).toBe(0);
    setCalm(true);
    expect(setMood(m, 'cheer')).toBe(0);
    expect(m.dataset.mood).toBe('cheer');
    expect(animated).toBe(1);
  });
});

describe('effects guardrails', () => {
  it('mastery bursts are much bigger than a correct answer’s, and capped', () => {
    expect(BURST.correct.count).toBeLessThanOrEqual(20);
    expect(BURST.silver.count + BURST.silver.confetti).toBeGreaterThan(3 * BURST.correct.count);
    expect(BURST.gold.count + BURST.gold.confetti).toBeGreaterThan(BURST.silver.count + BURST.silver.confetti);
    expect(BURST.gold.count + BURST.gold.confetti).toBeLessThanOrEqual(MAX_PARTICLES);
    expect(BURST.correct.ms).toBeLessThan(700);
    expect(BURST.gold.ms).toBeLessThanOrEqual(1600);
  });

  it('records each reaction for tests and makes no particles in calm mode', () => {
    setCalm(true);
    const btn = document.createElement('button');
    document.body.append(btn);
    expect(correctBurst(btn)).toBe(0);
    record('wrong', 0, 360);
    const layer = document.querySelector<HTMLCanvasElement>('.fx-layer')!;
    expect(layer.dataset).toMatchObject({ lastKind: 'wrong', lastParticles: '0', lastMs: '360' });
    let landed = false;
    expect(flyKey(btn, btn, 'C', 'silver', () => (landed = true))).toBe(0);
    expect(landed).toBe(true);
  });
});

describe('journey', () => {
  it('is a progressbar that moves with every answer and arrives at the end', () => {
    const j = new Journey('space', 4);
    expect(j.el.getAttribute('role')).toBe('progressbar');
    j.set(1, true);
    expect(j.el.getAttribute('aria-valuenow')).toBe('1');
    expect(j.el.querySelector<HTMLElement>('.journey__mover')!.style.transform).toBe('translateX(25%)');
    j.set(4);
    expect(j.el.classList.contains('journey--arrived')).toBe(true);
    expect(new Journey('unknown', 0).el.className).toContain('journey--sunny');
    const studio = new Journey('studio', 10);
    studio.set(2);
    expect(studio.el.querySelector<SVGElement>('.j-roll')!.style.transform).toBe('rotate(144deg)');
  });
});

describe('icons', () => {
  it('are decorative inline SVGs', () => {
    const i = icon('close', 'x');
    expect(i.getAttribute('aria-hidden')).toBe('true');
    expect(i.getAttribute('class')).toBe('icon icon--close x');
    expect(medal('gold').querySelector('.medal__star')).not.toBeNull();
  });
});
