import { describe, expect, it } from 'vitest';
import { PARAMS, type StudentState, daysThisWeek, level, newStudent, recall, recordAnswer } from '../src/core/engine';
import { defineItemSet } from '../src/core/itemset';
import {
  LADDER,
  LETTER_GROUP,
  LETTER_ITEMS,
  LETTER_MATH,
  LETTER_MATH_MODE,
  type Rung,
  answerSentence,
  isLetterItemId,
  letterAnswer,
  letterEngine,
  letterHint,
  letterItem,
  letterLabel,
  letterNotes,
  prompt,
  rungRows,
  rungSize,
  rungSteps,
  rungTitle,
  walkLetters,
} from '../src/core/letters';
import { LETTERS, type Letter, midi } from '../src/core/music';
import { isFinished, nextQuestion, startSession, submit, summarize } from '../src/core/session';
import { DAY, T0, seededRng } from './helpers';

const item = (rung: Rung, start: Letter) => letterItem(`lm:${rung}:${start}`);
const ans = (rung: Rung, start: Letter) => letterAnswer(item(rung, start));
const lane = LETTER_MATH.groups[LETTER_GROUP]!;

function correct(s: StudentState, id: string, now: number, rt = 1500) {
  return letterEngine.recordAnswer(s, id, 'correct', letterEngine.answerOf(id), rt, now);
}

describe('Letter Math items', () => {
  it('has 18 rungs of 7 items with unique ids', () => {
    expect(LADDER).toHaveLength(18);
    expect(LETTER_ITEMS).toHaveLength(126);
    expect(new Set(LETTER_ITEMS.map((i) => i.id)).size).toBe(126);
    expect(LETTER_ITEMS.every((i) => isLetterItemId(i.id))).toBe(true);
    expect(isLetterItemId('name:treble:G4')).toBe(false);
    expect(() => letterItem('lm:nope:C')).toThrow();
  });

  it('every rung starts from each letter once and has each answer once', () => {
    for (const { rung, starts } of LADDER) {
      expect([...starts].sort()).toEqual([...LETTERS].sort());
      const answers = [...starts].map((s) => ans(rung, s as Letter));
      expect(new Set(answers).size, rung).toBe(7);
    }
  });

  it('gets the musical alphabet right, including the wrap-around', () => {
    expect(ans('after', 'G')).toBe('A');
    expect(ans('after', 'B')).toBe('C');
    expect(ans('before', 'C')).toBe('B');
    expect(ans('before', 'A')).toBe('G');
    expect(ans('skipUp', 'C')).toBe('E');
    expect(ans('skipUp', 'F')).toBe('A');
    expect(ans('skipDown', 'C')).toBe('A');
    expect(ans('up5', 'D')).toBe('A');
    expect(ans('down5', 'D')).toBe('G');
    expect(ans('up4', 'C')).toBe('F');
    expect(ans('up6', 'C')).toBe('A');
    expect(ans('up7', 'C')).toBe('B');
    expect(ans('down3', 'E')).toBe('C');
    expect(ans('up8', 'D')).toBe('D');
    for (const l of LETTERS) {
      expect(ans('up2', l)).toBe(ans('after', l));
      expect(ans('down2', l)).toBe(ans('before', l));
      expect(ans('up3', l)).toBe(ans('skipUp', l));
      expect(ans('down3', l)).toBe(ans('skipDown', l));
    }
  });

  it('knows each rung’s size and direction', () => {
    expect(rungSteps('after')).toBe(1);
    expect(rungSteps('before')).toBe(-1);
    expect(rungSteps('skipDown')).toBe(-2);
    expect(rungSteps('up5')).toBe(4);
    expect(rungSteps('down8')).toBe(-7);
    expect(rungSize('skipUp')).toBeNull();
    expect(rungSize('down6')).toBe(6);
  });

  it('skips up follow the chain C E G B D F A', () => {
    const chain = [...LADDER.find((r) => r.rung === 'skipUp')!.starts];
    expect(chain.join('')).toBe('CEGBDFA');
    chain.forEach((l, i) => expect(ans('skipUp', l as Letter)).toBe(chain[(i + 1) % 7]));
  });
});

describe('Letter Math ladder: one button can’t carry early play', () => {
  it('starts with next-letter-up, then down, then skips, then numbered intervals', () => {
    expect(LADDER.slice(0, 4).map((r) => r.rung)).toEqual(['after', 'before', 'skipUp', 'skipDown']);
    expect(LADDER.slice(4).every((r) => rungSize(r.rung) !== null)).toBe(true);
    expect(lane.map((i) => i.id)).toEqual(LETTER_ITEMS.map((i) => i.id));
  });

  it('the items open at the start have different answers, and the first 7 cover all letters', () => {
    const answers = lane.map(letterAnswer);
    expect(new Set(answers.slice(0, PARAMS.initialUnlock)).size).toBe(PARAMS.initialUnlock);
    expect(new Set(answers.slice(0, 7))).toEqual(new Set(LETTERS));
    // Each rung on its own also spreads over all 7 answers (checked above), so every 7-item stretch
    // of new material in a rung is varied.
  });

  it('teaches the G → A wrap-around early but not first', () => {
    const idx = lane.findIndex((i) => i.id === 'lm:after:G');
    expect(idx).toBeGreaterThanOrEqual(PARAMS.initialUnlock);
    expect(idx).toBeLessThan(5);
    expect(lane.findIndex((i) => i.id === 'lm:before:A') - 7).toBeLessThan(5);
  });

  it('a new learner has the first three items open', () => {
    const s = letterEngine.newStudent();
    const open = LETTER_ITEMS.filter((i) => s.items[i.id]!.unlocked).map((i) => i.id);
    expect(open).toEqual(lane.slice(0, 3).map((i) => i.id));
  });
});

describe('Letter Math wording', () => {
  it('asks questions a 6-year-old can read', () => {
    expect(prompt(item('after', 'G'))).toEqual({ lead: 'What comes after', letter: 'G', tail: '?' });
    expect(prompt(item('before', 'C')).lead).toBe('What comes before');
    expect(prompt(item('skipUp', 'C')).lead).toBe('Skip up from');
    expect(prompt(item('skipDown', 'C')).lead).toBe('Skip down from');
    expect(prompt(item('up5', 'D')).lead).toBe("What's a 5th up from");
    expect(prompt(item('down3', 'D')).lead).toBe("What's a 3rd down from");
  });

  it('labels and answer sentences', () => {
    expect(letterLabel('lm:after:G')).toBe('after G');
    expect(letterLabel('lm:before:C')).toBe('before C');
    expect(letterLabel('lm:skipUp:C')).toBe('skip up from C');
    expect(letterLabel('lm:skipDown:E')).toBe('skip down from E');
    expect(letterLabel('lm:up5:D')).toBe('a 5th up from D');
    expect(letterLabel('lm:down8:D')).toBe('an 8th down from D');
    expect(prompt(item('up8', 'C')).lead).toBe("What's an 8th up from");
    expect(answerSentence(item('up8', 'C'))).toBe('An 8th up from C is C.');
    expect(answerSentence(item('after', 'G'))).toBe('After G comes A.');
    expect(answerSentence(item('before', 'C'))).toBe('Before C comes B.');
    expect(answerSentence(item('skipDown', 'C'))).toBe('Skip down from C and you land on A.');
    expect(answerSentence(item('up5', 'D'))).toBe('A 5th up from D is A.');
    expect(answerSentence(item('down4', 'C'))).toBe('A 4th down from C is G.');
  });

  it('rung titles', () => {
    expect(rungTitle('after')).toBe('Next letter up');
    expect(rungTitle('before')).toBe('Next letter down');
    expect(rungTitle('skipUp')).toBe('Skip up');
    expect(rungTitle('skipDown')).toBe('Skip down');
    expect(rungTitle('up5')).toBe('5th up');
    expect(rungTitle('down7')).toBe('7th down');
  });
});

describe('Letter Math hints: show the letter walk', () => {
  it('counts intervals including the starting letter', () => {
    const h = letterHint(item('up5', 'D'));
    expect(h.lines).toContain('Count 5 letters up, starting on D: D(1) E(2) F(3) G(4) A(5).');
    expect(h.walk).toEqual([
      { letter: 'D', n: 1 },
      { letter: 'E', n: 2 },
      { letter: 'F', n: 3 },
      { letter: 'G', n: 4 },
      { letter: 'A', n: 5 },
    ]);
    expect(h.lines.join(' ')).toContain('After G, the alphabet starts over at A.');
  });

  it('counts down too, and explains 2nds, 3rds and octaves', () => {
    const down = letterHint(item('down4', 'C'));
    expect(down.lines).toContain('Count 4 letters down, starting on C: C(1) B(2) A(3) G(4).');
    expect(down.lines).toContain('Before A, the alphabet loops back around to G.');
    expect(letterHint(item('up2', 'C')).lines[0]).toBe('A 2nd is the very next letter.');
    expect(letterHint(item('down3', 'E')).lines[0]).toBe('A 3rd is a skip.');
    const octave = letterHint(item('up8', 'C'));
    expect(octave.lines[0]).toContain('same letter');
    expect(octave.walk).toHaveLength(8);
    expect(letterHint(item('up4', 'C')).lines).toEqual(['Count 4 letters up, starting on C: C(1) D(2) E(3) F(4).']);
  });

  it('explains the wrap-around for next letter up and down', () => {
    expect(letterHint(item('after', 'G')).lines[0]).toContain('After G, the alphabet starts over at A.');
    expect(letterHint(item('after', 'G')).walk).toEqual([{ letter: 'G' }, { letter: 'A' }]);
    expect(letterHint(item('after', 'C')).lines[0]).toContain('Go up one letter');
    expect(letterHint(item('before', 'A')).lines[0]).toContain('loops back around to G');
    expect(letterHint(item('before', 'E')).lines[0]).toContain('Go back one letter');
  });

  it('shows the hopped-over letter for skips', () => {
    const h = letterHint(item('skipUp', 'C'));
    expect(h.walk).toEqual([{ letter: 'C', skipped: false }, { letter: 'D', skipped: true }, { letter: 'E', skipped: false }]);
    expect(h.lines[0]).toBe('A skip jumps over one letter: from C, hop over D, land on E.');
    expect(h.lines).toContain('Skips make a chain: C E G B D F A.');
    const wrap = letterHint(item('skipDown', 'B'));
    expect(wrap.lines).toContain('Before A, the alphabet loops back around to G.');
    expect(wrap.lines).toContain('Skips make a chain: A F D B G E C.');
  });

  it('walks letters both ways', () => {
    expect(walkLetters('F', 3)).toEqual(['F', 'G', 'A', 'B']);
    expect(walkLetters('D', -2)).toEqual(['D', 'C', 'B']);
    expect(walkLetters('D', 0)).toEqual(['D']);
  });
});

describe('Letter Math sound', () => {
  it('plays the start note and then the answer, going the asked direction near middle C', () => {
    for (const i of LETTER_ITEMS) {
      const [a, b] = letterNotes(i);
      expect(a.letter).toBe(i.start);
      expect(b.letter).toBe(letterAnswer(i));
      expect(Math.sign(midi(b) - midi(a))).toBe(Math.sign(i.steps));
      expect(midi(a)).toBeGreaterThanOrEqual(48);
      expect(midi(b)).toBeLessThanOrEqual(84);
    }
  });
});

describe('mastery map rows', () => {
  it('lists every rung with its items by start letter A–G', () => {
    const rows = rungRows();
    expect(rows).toHaveLength(18);
    expect(rows[0]!.items.map((i) => i.start).join('')).toBe('ABCDEFG');
    expect(rows.flatMap((r) => r.items)).toHaveLength(126);
  });
});

describe('item sets', () => {
  it('reject duplicate ids', () => {
    expect(() =>
      defineItemSet<{ id: string }>({ id: 'x', groups: { a: [{ id: '1' }, { id: '1' }] }, groupOf: () => 'a', answerOf: () => 'C' }),
    ).toThrow(/Duplicate/);
  });
});

describe('Letter Math with the shared engine', () => {
  it('a random guesser never earns mastery', () => {
    const s = letterEngine.newStudent();
    const rng = seededRng(11);
    const events = [];
    let now = T0;
    for (let i = 0; i < 600; i++) {
      const id = letterEngine.selectItem(s, [LETTER_GROUP], now, rng);
      const guess = LETTERS[Math.floor(rng() * 7)] as Letter;
      const outcome = guess === letterEngine.answerOf(id) ? 'correct' : 'wrong';
      events.push(...letterEngine.recordAnswer(s, id, outcome, guess, 250, now).events);
      now += 2000;
    }
    expect(events.filter((e) => e.kind === 'silver' || e.kind === 'gold')).toHaveLength(0);
    const open = LETTER_ITEMS.filter((i) => s.items[i.id]!.unlocked);
    expect(open.reduce((a, i) => a + recall(s.items[i.id]!, now), 0) / open.length).toBeLessThan(0.5);
  });

  it('pressing one button every time stays stuck: mostly wrong, nothing unlocks', () => {
    for (const button of LETTERS) {
      const s = letterEngine.newStudent();
      const rng = seededRng(12);
      let now = T0;
      let right = 0;
      const events = [];
      for (let i = 0; i < 200; i++) {
        const id = letterEngine.selectItem(s, [LETTER_GROUP], now, rng);
        const outcome = button === letterEngine.answerOf(id) ? 'correct' : 'wrong';
        if (outcome === 'correct') right++;
        events.push(...letterEngine.recordAnswer(s, id, outcome, button, 300, now).events);
        now += 2000;
      }
      expect(right / 200, button).toBeLessThan(0.5);
      expect(events.filter((e) => e.kind === 'unlocked'), button).toHaveLength(0);
      // At most the one starter item whose answer really is that letter can shine.
      expect(events.filter((e) => e.kind === 'silver').length, button).toBeLessThanOrEqual(1);
    }
  });

  it('an honest learner who knows the alphabet earns silver and unlocks new questions', () => {
    const s = letterEngine.newStudent();
    const rng = seededRng(13);
    const events = [];
    let now = T0;
    for (let i = 0; i < 60; i++) {
      const id = letterEngine.selectItem(s, [LETTER_GROUP], now, rng);
      events.push(...correct(s, id, now, 1800).events);
      now += 4000;
    }
    expect(events.filter((e) => e.kind === 'silver').length).toBeGreaterThanOrEqual(3);
    expect(events.filter((e) => e.kind === 'unlocked').length).toBeGreaterThanOrEqual(3);
    expect(s.items['lm:after:G']!.unlocked).toBe(true);
  });

  it('a kid who practices most days climbs the ladder to skips and intervals, earning gold', () => {
    const s = letterEngine.newStudent();
    const rng = seededRng(14);
    let now = T0;
    const events = [];
    for (let day = 0; day < 14; day++) {
      const session = startSession([LETTER_GROUP], 20, LETTER_MATH_MODE);
      while (!isFinished(session)) {
        const q = nextQuestion(session, s, now, rng);
        const target = letterEngine.answerOf(q.itemId);
        now += 2200;
        // Mostly right; harder rungs a bit less so.
        const p = Math.abs(letterItem(q.itemId).steps) > 2 ? 0.85 : 0.95;
        events.push(...submit(session, s, rng() < p ? target : rng() < 0.5 ? null : target === 'C' ? 'D' : 'C', now).events);
        now += 800;
      }
      now += DAY;
    }
    const open = LETTER_ITEMS.filter((i) => s.items[i.id]!.unlocked);
    expect(open.some((i) => i.rung === 'skipUp')).toBe(true);
    expect(events.some((e) => e.kind === 'gold')).toBe(true);
    expect(LETTER_ITEMS.filter((i) => level(s.items[i.id]!) === 'gold').length).toBeGreaterThan(5);
  });

  it('keeps sessions varied: no answer letter dominates', () => {
    const s = letterEngine.newStudent();
    const rng = seededRng(15);
    let now = T0;
    for (let n = 1; n <= 8; n++) {
      const session = startSession([LETTER_GROUP], 20, LETTER_MATH_MODE);
      const answers: string[] = [];
      let repeats = 0;
      while (!isFinished(session)) {
        const q = nextQuestion(session, s, now, rng);
        const target = letterEngine.answerOf(q.itemId);
        if (answers.at(-1) === target) repeats++;
        answers.push(target);
        now += 2000;
        submit(session, s, rng() < 0.85 ? target : null, now);
      }
      const most = Math.max(...LETTERS.map((l) => answers.filter((x) => x === l).length));
      expect(most, `session ${n}: ${answers.join('')}`).toBeLessThanOrEqual(8);
      expect(repeats, `session ${n}: ${answers.join('')}`).toBeLessThanOrEqual(3);
      now += 6 * 60 * 60_000;
    }
  });

  it('never abandons a weak item', () => {
    const s = letterEngine.newStudent();
    const open = lane.slice(0, 7);
    for (const i of open) {
      s.items[i.id]!.unlocked = true;
      for (let k = 0; k < 6; k++) correct(s, i.id, T0 + k);
    }
    const weak = 'lm:after:G';
    for (let k = 0; k < 4; k++) letterEngine.recordAnswer(s, weak, 'wrong', 'B', 1000, T0);
    const rng = seededRng(16);
    const picks = Array.from({ length: 400 }, () => letterEngine.selectItem(s, [LETTER_GROUP], T0, rng));
    expect(picks.filter((p) => p === weak).length / 400).toBeGreaterThan(1.5 / open.length);
  });

  it('keeps its own speed baseline, separate from Name It', () => {
    const name = newStudent();
    recordAnswer(name, 'name:treble:G4', 'correct', 'G', 900, T0);
    const letters = letterEngine.newStudent();
    correct(letters, 'lm:after:C', T0, 4000);
    expect(name.rtBaseline).toBe(900);
    expect(letters.rtBaseline).toBe(4000);
  });

  it('sessions use the Letter Math answer and never show Name It lessons', () => {
    const s = letterEngine.newStudent();
    const session = startSession([LETTER_GROUP], 3, LETTER_MATH_MODE);
    for (let i = 0; i < 3; i++) {
      session.current = { itemId: 'lm:after:C', shownAt: T0 };
      const res = submit(session, s, 'B', T0 + 1000);
      expect(res.outcome).toBe('wrong');
      expect(res.lesson).toBeNull();
    }
    session.results.length = 0;
    session.current = { itemId: 'lm:after:C', shownAt: T0 };
    expect(submit(session, s, 'D', T0 + 1000).outcome).toBe('correct');
    expect(summarize(session).correct).toBe(1);
  });

  it('weekly goal counts practice in either mode once per day', () => {
    const name = newStudent();
    const letters = letterEngine.newStudent();
    recordAnswer(name, 'name:treble:G4', 'correct', 'G', 1000, T0 - DAY); // Monday
    correct(letters, 'lm:after:C', T0 - DAY);
    correct(letters, 'lm:after:C', T0); // Tuesday
    expect(daysThisWeek([name, letters], T0)).toBe(2);
    expect(daysThisWeek(name, T0)).toBe(1);
  });

  it('normalizes saved Letter Math states missing newer items', () => {
    const s = letterEngine.newStudent();
    delete s.items['lm:down7:F'];
    expect(letterEngine.normalize(s).items['lm:down7:F']).toBeDefined();
  });

  it('ignores unknown lanes when unlocking', () => {
    expect(letterEngine.maybeUnlock(letterEngine.newStudent(), 'nope', T0)).toBeNull();
  });
});
