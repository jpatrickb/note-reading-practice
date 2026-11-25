import { describe, expect, it } from 'vitest';
import {
  PARAMS,
  type StudentState,
  dayIndex,
  daysThisWeek,
  fluency,
  isDusty,
  level,
  maybeUnlock,
  nameEngine,
  newStudent,
  normalize,
  recall,
  recordAnswer,
  selectItem,
} from '../src/core/engine';
import { ITEMS, ITEMS_BY_CLEF, itemById } from '../src/core/items';
import { DAY, HOUR, T0, seededRng } from './helpers';
import { honestLearner, randomGuesser, simulate } from './sim';

const G4 = 'name:treble:G4';

function answerCorrect(s: StudentState, id: string, now: number, rt = 1500) {
  return recordAnswer(s, id, 'correct', itemById(id).note.letter, rt, now);
}

describe('engine basics', () => {
  it('starts with three guide notes unlocked per clef', () => {
    const s = newStudent();
    const unlocked = ITEMS.filter((i) => s.items[i.id]!.unlocked).map((i) => i.id);
    expect(unlocked).toHaveLength(6);
    expect(unlocked).toContain(G4);
    expect(level(s.items[G4]!)).toBe('learning');
    expect(level(s.items['name:treble:A5']!)).toBe('locked');
  });

  it('raises recall on correct answers and lowers it more on wrong ones', () => {
    const a = newStudent();
    const b = newStudent();
    const p0 = recall(a.items[G4]!, T0);
    recordAnswer(a, G4, 'correct', 'G', 1500, T0);
    recordAnswer(b, G4, 'wrong', 'A', 1500, T0);
    const up = recall(a.items[G4]!, T0) - p0;
    const down = p0 - recall(b.items[G4]!, T0);
    expect(up).toBeGreaterThan(0);
    expect(down).toBeGreaterThan(up);
  });

  it('"I don\'t know" costs less than a wrong answer', () => {
    const idk = newStudent();
    const wrong = newStudent();
    recordAnswer(idk, G4, 'idk', null, 1500, T0);
    recordAnswer(wrong, G4, 'wrong', 'A', 1500, T0);
    expect(recall(idk.items[G4]!, T0)).toBeGreaterThan(recall(wrong.items[G4]!, T0));
    expect(Object.keys(idk.confusions)).toHaveLength(0);
    expect(wrong.confusions[`${G4}>A`]).toBe(1);
  });

  it('forgets over time, and spaced reviews build stability faster than cramming', () => {
    const crammer = newStudent();
    const spacer = newStudent();
    for (let i = 0; i < 6; i++) answerCorrect(crammer, G4, T0 + i * 60_000);
    for (let i = 0; i < 6; i++) answerCorrect(spacer, G4, T0 + i * DAY);
    const crammed = crammer.items[G4]!;
    expect(recall(crammed, crammed.last + 3 * DAY)).toBeLessThan(recall(crammed, crammed.last));
    expect(spacer.items[G4]!.s).toBeGreaterThan(crammed.s * 5);
  });

  it('judges speed against the kid\'s own baseline, never punishing fast answers', () => {
    expect(fluency(200, 3000)).toBe(1);
    expect(fluency(4000, 3000)).toBe(1);
    expect(fluency(9000, 3000)).toBeLessThan(1);
    expect(fluency(60000, 3000)).toBe(0.6);
  });

  it('caps response times so walking away does not wreck the baseline', () => {
    const s = newStudent();
    answerCorrect(s, G4, T0, 10 * 60_000);
    expect(s.rtBaseline).toBe(PARAMS.rtCap);
  });

  it('keeps a bounded list of recent errors', () => {
    const s = newStudent();
    for (let i = 0; i < 30; i++) recordAnswer(s, G4, 'wrong', 'A', 1000, T0 + i);
    expect(s.recentErrors).toHaveLength(PARAMS.maxErrors);
  });

  it('throws on unknown items', () => {
    expect(() => recordAnswer(newStudent(), 'x', 'correct', 'C', 1, T0)).toThrow();
  });

  it('normalizes states saved before new items existed', () => {
    const s = newStudent();
    delete s.items['name:bass:E2'];
    expect(normalize(s).items['name:bass:E2']).toBeDefined();
  });
});

describe('mastery rewards', () => {
  it('awards silver for reliable, fluent recall — once', () => {
    const s = newStudent();
    const events = [];
    for (let i = 0; i < 8; i++) events.push(...answerCorrect(s, G4, T0 + i * 30_000).events);
    expect(events.filter((e) => e.kind === 'silver' && e.itemId === G4)).toHaveLength(1);
    expect(level(s.items[G4]!)).toBe('silver');
  });

  it('only awards gold on a later day (retention, not cramming)', () => {
    const s = newStudent();
    for (let i = 0; i < 30; i++) answerCorrect(s, G4, T0 + i * 10_000);
    expect(level(s.items[G4]!)).toBe('silver');
    const nextDay = T0 + DAY;
    const events = [];
    for (let i = 0; i < 4; i++) events.push(...answerCorrect(s, G4, nextDay + i * 30_000).events);
    expect(events.some((e) => e.kind === 'gold')).toBe(true);
    expect(level(s.items[G4]!)).toBe('gold');
  });

  it('does not award silver for slow, effortful answers relative to the kid\'s norm', () => {
    const s = newStudent();
    // Establish a fast personal baseline on another note.
    for (let i = 0; i < 20; i++) answerCorrect(s, 'name:treble:C4', T0 + i * 1000, 800);
    for (let i = 0; i < 6; i++) answerCorrect(s, G4, T0 + 100_000 + i * 1000, 6000);
    expect(s.items[G4]!.best).toBe(0);
  });

  it('marks faded notes as dusty and rewards polishing them', () => {
    const s = newStudent();
    for (let i = 0; i < 8; i++) answerCorrect(s, G4, T0 + i * 30_000);
    const later = T0 + 20 * DAY;
    expect(isDusty(s.items[G4]!, later)).toBe(true);
    const events = [];
    for (let i = 0; i < 6; i++) events.push(...answerCorrect(s, G4, later + i * 30_000).events);
    expect(events.some((e) => e.kind === 'polished' || e.kind === 'gold')).toBe(true);
  });

  it('a random guesser never earns mastery (guessing has negative value)', () => {
    const r = simulate({ engine: nameEngine, groups: ['treble', 'bass'], policy: randomGuesser(), sessions: 30, seed: 1 });
    expect(r.picks).toHaveLength(600);
    expect(r.silver + r.gold).toBe(0);
    expect(r.meanRecall).toBeLessThan(0.5);
  });

  it('an honest learner who knows the notes earns silver and unlocks new notes quickly', () => {
    const r = simulate({ engine: nameEngine, groups: ['treble'], policy: honestLearner({ learnAfter: 0, rtMs: 1200 }), sessions: 3, seed: 2 });
    expect(r.silver).toBeGreaterThanOrEqual(3);
    expect(r.unlocked).toBeGreaterThanOrEqual(3);
  });
});

describe('unlocking', () => {
  it('waits until most unlocked notes are going well', () => {
    const s = newStudent();
    expect(maybeUnlock(s, 'treble', T0)).toBeNull();
    for (const item of ITEMS_BY_CLEF.treble.slice(0, 3)) {
      for (let i = 0; i < 3; i++) answerCorrect(s, item.id, T0 + i);
    }
    expect(s.items[ITEMS_BY_CLEF.treble[3]!.id]!.unlocked).toBe(true);
  });

  it('never unlocks on top of a weak note in a small set', () => {
    const s = newStudent();
    const [a, b, c] = ITEMS_BY_CLEF.treble;
    for (let i = 0; i < 3; i++) answerCorrect(s, a!.id, T0 + i);
    for (let i = 0; i < 3; i++) answerCorrect(s, b!.id, T0 + i);
    recordAnswer(s, c!.id, 'wrong', 'D', 1000, T0);
    recordAnswer(s, c!.id, 'wrong', 'D', 1000, T0);
    expect(maybeUnlock(s, 'treble', T0)).toBeNull();
  });

  it('lets one stubborn note ride along in a larger set', () => {
    const s = newStudent();
    const open = ITEMS_BY_CLEF.treble.slice(0, 8);
    for (const item of open) Object.assign(s.items[item.id]!, { unlocked: true, m: 3, n: 3, c: 3, last: T0 });
    Object.assign(s.items[open[7]!.id]!, { m: -2 });
    expect(maybeUnlock(s, 'treble', T0)).toBe(ITEMS_BY_CLEF.treble[8]!.id);
    // A second weak note (the one just unlocked, unseen) blocks the next unlock.
    expect(maybeUnlock(s, 'treble', T0)).toBeNull();
  });

  it('stops when every note is unlocked', () => {
    const s = newStudent();
    for (const i of ITEMS) s.items[i.id]!.unlocked = true;
    expect(maybeUnlock(s, 'bass', T0)).toBeNull();
  });
});

describe('item selection', () => {
  it('only picks unlocked items in the chosen clefs and is deterministic per seed', () => {
    const s = newStudent();
    const a = Array.from({ length: 50 }, (_, i) => selectItem(s, ['bass'], T0 + i, seededRng(i)));
    const b = Array.from({ length: 50 }, (_, i) => selectItem(s, ['bass'], T0 + i, seededRng(i)));
    expect(a).toEqual(b);
    for (const id of a) {
      expect(itemById(id).clef).toBe('bass');
      expect(s.items[id]!.unlocked).toBe(true);
    }
  });

  it('avoids repeating the last two items', () => {
    const s = newStudent();
    const rng = seededRng(3);
    for (let i = 0; i < 50; i++) {
      const id = selectItem(s, ['treble', 'bass'], T0, rng, [
        { itemId: G4, correct: true },
        { itemId: 'name:bass:F3', correct: true },
      ]);
      expect([G4, 'name:bass:F3']).not.toContain(id);
    }
  });

  it('finish mode favors the easiest notes', () => {
    const s = newStudent();
    for (let i = 0; i < 10; i++) answerCorrect(s, G4, T0 + i);
    recordAnswer(s, 'name:treble:C4', 'wrong', 'D', 1000, T0);
    recordAnswer(s, 'name:treble:A4', 'wrong', 'D', 1000, T0);
    const rng = seededRng(4);
    const picks = Array.from({ length: 40 }, () => selectItem(s, ['treble'], T0, rng, [], 'finish'));
    expect(picks.filter((p) => p === G4).length).toBeGreaterThan(30);
  });

  it('never abandons a weak note (regression: weak notes used to vanish)', () => {
    const s = newStudent();
    const open = ITEMS_BY_CLEF.treble.slice(0, 6);
    for (const item of open) {
      s.items[item.id]!.unlocked = true;
      for (let i = 0; i < 6; i++) answerCorrect(s, item.id, T0 + i);
    }
    const weak = open[3]!.id;
    for (let i = 0; i < 4; i++) recordAnswer(s, weak, 'wrong', 'B', 1000, T0);
    const rng = seededRng(8);
    const picks = Array.from({ length: 400 }, () => selectItem(s, ['treble'], T0, rng));
    expect(picks.filter((p) => p === weak).length / 400).toBeGreaterThan(0.3);
  });

  it('rarely asks for the same answer letter twice in a row', () => {
    const s = newStudent();
    const rng = seededRng(9);
    const prev = [{ itemId: 'name:treble:G4', correct: true }];
    const picks = Array.from({ length: 300 }, () => selectItem(s, ['treble', 'bass'], T0, rng, prev));
    // Bass G3 is the only other G among the six starters.
    expect(picks.filter((p) => itemById(p).note.letter === 'G').length / 300).toBeLessThan(0.08);
  });

  it('leans on known notes during a rough patch', () => {
    const s = newStudent();
    for (let i = 0; i < 6; i++) answerCorrect(s, G4, T0 + i);
    const rough = [1, 2, 3, 4].map(() => ({ itemId: 'name:bass:F3', correct: false }));
    const fine = [1, 2, 3, 4].map(() => ({ itemId: 'name:bass:F3', correct: true }));
    const count = (recent: typeof rough) => {
      const rng = seededRng(10);
      return Array.from({ length: 400 }, () => selectItem(s, ['treble'], T0, rng, recent)).filter((p) => p === G4).length;
    };
    expect(count(rough)).toBeGreaterThan(count(fine) * 1.5);
  });

  it('throws when nothing is available', () => {
    const s = newStudent();
    for (const i of ITEMS) s.items[i.id]!.unlocked = false;
    expect(() => selectItem(s, ['treble'], T0, Math.random)).toThrow();
  });
});

describe('weekly goal', () => {
  it('counts distinct practice days in the current Monday-start week', () => {
    const s = newStudent();
    // T0 is Tuesday 2026-11-24.
    answerCorrect(s, G4, T0 - 2 * DAY); // Sunday (last week)
    answerCorrect(s, G4, T0 - DAY); // Monday
    answerCorrect(s, G4, T0);
    answerCorrect(s, G4, T0 + HOUR); // same day: not double counted
    expect(daysThisWeek(s, T0)).toBe(2);
    expect(dayIndex(T0) - dayIndex(T0 - DAY)).toBe(1);
  });
});
