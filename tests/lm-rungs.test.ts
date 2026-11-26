// Letter Math 2nds/3rds pacing baseline (issue #25). Two kids who know next letter and skips cold:
//  - quickNamer picks up interval names fast (a couple of sightings per size, up and down share it);
//  - noNames barely learns them (slow, so the naming lesson really is needed).
// Measured: sessions until all 28 2nd/3rd items are open. Cross-rung "twin" transfer (a 2nd up from D =
// the next letter after D) was prototyped (prior, selection boost, first-try credit, rung test-out) and
// either gained under 2 sessions or overloaded the kid who half-knows the names (maxStruggling > 10),
// so these tests pin today's behavior as the bar a future change has to beat.
import { describe, expect, it } from 'vitest';
import { LETTER_GROUP, LETTER_MATH_MODE } from '../src/core/letters';
import { allOpen, learner, rungIds, simulate } from './sim';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const isInterval = (id: string) => /^lm:(up|down)\d:/.test(id);
/** This kid learns names by size ("2nd" is one idea, up or down). */
const skillOf = (id: string) => (isInterval(id) ? id.split(':')[1]!.replace(/^(up|down)/, '') : 'steps');
const quickNamer = learner((id) => (!isInterval(id) ? 1 : 0.1), 1800, 0.45, 0.35);
const noNames = learner((id) => (!isInterval(id) ? 1 : 0.03), 1800, 0.12, 0.02);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const ids23 = ['up2', 'down2', 'up3', 'down3'].flatMap((r) => rungIds(r as 'up2'));
const run = (policy: typeof quickNamer) =>
  SEEDS.map((seed) => allOpen(simulate({ mode: LETTER_MATH_MODE, groups: [LETTER_GROUP], policy, sessions: 30, seed, skillOf }), ids23));

describe('Letter Math 2nds/3rds: sessions until all 28 are open', () => {
  it('a kid who learns names quickly gets through in about 12 sessions; one who does not, not within 30', () => {
    const quick = run(quickNamer);
    const slow = run(noNames);
    expect(median(quick), quick.join(',')).toBeLessThanOrEqual(14);
    expect(median(quick), quick.join(',')).toBeGreaterThanOrEqual(8);
    expect(median(slow), slow.join(',')).toBeGreaterThan(24);
  });
});
