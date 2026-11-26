// What a game mode is, to the UI. A mode is ONE `defineMode({...})` object in its own file, listed in
// ONE place (src/ui/modes.ts); the app, the home chooser, the My progress screen, toasts and the
// summary are all driven by it, so none of them ever names a mode. Its learner model is a
// `CoreMode` in src/core/modes.ts (permanent progress-code tag + engine). See CONTRIBUTING.md,
// "Adding a game mode".

import type { Synth } from '../audio/synth';
import type { Profile } from '../core/codec';
import { type StudentState, level } from '../core/engine';
import type { CoreMode } from '../core/modes';
import type { Clef } from '../core/music';
import type { SessionMode } from '../core/session';
import type { PlayHost, PlayShell } from './playShell';
import { type IconName, icon } from './world/icons';

/** Home-screen headings, in the order they are shown. A mode picks one; empty groups are hidden. */
export const MODE_GROUPS = [
  { id: 'read', title: 'Read notes' },
  { id: 'keys', title: 'Find keys' },
  { id: 'alphabet', title: 'Alphabet & theory' },
  { id: 'ear', title: 'Listen' },
  { id: 'music', title: 'Play music' },
] as const;

export type ModeGroup = (typeof MODE_GROUPS)[number]['id'];

/** Can the kid play this mode right now? A locked mode is shown with its reason, never hidden. */
export type Availability = { ok: true } | { ok: false; reason: string };

/** Things the app hands every mode when it builds a play screen. */
export interface ModeEnv {
  synth: Synth;
  /** The kid's learner models, for a mode that reads another mode's progress (Word Decoder reads Name It). */
  profile: Profile;
}

/** The mode's kid-facing nouns, for toasts and the summary. */
export interface ModeWords {
  /** What a new item is called: "note", "question". */
  item: string;
  /** Qualifies medals ("Silver key: G!", "New gold keys"); '' for none. */
  medal: string;
  /** The summary line when nothing new was earned this time. */
  encourage: string;
}

export interface MapOptions {
  /** Only these lanes (the summary shows the clefs just practiced); default all. */
  lanes?: readonly string[];
  /** Include the mode's legend and "needs a polish" note (My progress); default off. */
  legend?: boolean;
}

export interface UiMode {
  /** Same as `core.id` (and `core.engine.set.id`). */
  readonly id: string;
  /** Kid-facing name on the home card: short. */
  readonly title: string;
  /** A built-in icon name, or a function drawing your own inline SVG. */
  readonly icon: IconName | (() => SVGElement);
  /** One line, 8 words at most. */
  readonly blurb: string;
  readonly group: ModeGroup;
  /** The learner model: permanent progress-code tag and engine. */
  readonly core: CoreMode;
  /** What a session plays: the engine plus an optional misconception detector. */
  readonly session: SessionMode<string>;
  /** `'clefs'`: the home screen offers the clef picker for this mode. */
  readonly lanes: 'clefs' | null;
  readonly words: ModeWords;
  /** The unlock lanes a session practices, given the chosen clefs (ignored without `lanes`). */
  groups(clefs: readonly Clef[], profile?: Profile): string[];
  /** Build the play screen; its prompt, input and hints are the mode's own, the flow is the shell's. */
  createPlay(host: PlayHost<string>, env: ModeEnv): PlayShell<string>;
  /** This mode's progress map (My progress, and the summary after a session). */
  renderMap(state: StudentState, now: number, opts?: MapOptions): HTMLElement;
  /** Silver + gold items, for the home pill and My progress. */
  counts(state: StudentState): { gold: number; silver: number };
  /** Kid-facing name of an item, for toasts and summaries. */
  itemLabel(itemId: string): string;
  availability(profile: Profile): Availability;
}

/** What a mode file writes: the required parts, and the optional ones that have sensible defaults. */
export interface ModeSpec<A extends string> {
  id: string;
  title: string;
  icon: UiMode['icon'];
  blurb: string;
  group: ModeGroup;
  core: CoreMode;
  words: ModeWords;
  createPlay(host: PlayHost<A>, env: ModeEnv): PlayShell<A>;
  renderMap(state: StudentState, now: number, opts?: MapOptions): HTMLElement;
  /** Default: just the engine. Supply it for a misconception detector (`diagnose`). */
  session?: SessionMode<A>;
  /** Default: no lanes. */
  lanes?: 'clefs' | null;
  /** Default: the clefs chosen, or every lane of the item set if the mode has no clef lanes. */
  groups?(clefs: readonly Clef[], profile?: Profile): string[];
  /** Default: gold and silver items. */
  counts?(state: StudentState): { gold: number; silver: number };
  /** Default: the item id. */
  itemLabel?(itemId: string): string;
  /** Default: always available. */
  availability?(profile: Profile): Availability;
}

/** The mode's icon as an element. */
export function modeIcon(mode: UiMode, cls = ''): Element {
  return typeof mode.icon === 'string' ? icon(mode.icon, cls) : mode.icon();
}

/** Gold and silver items of a learner model (works for every mode: it only reads item levels). */
export function medalCounts(state: StudentState): { gold: number; silver: number } {
  const counts = { gold: 0, silver: 0 };
  for (const it of Object.values(state.items)) {
    const l = level(it);
    if (l === 'gold' || l === 'silver') counts[l]++;
  }
  return counts;
}

/** Has the kid answered anything in this mode? (My progress lists only those.) */
export function hasProgress(state: StudentState | undefined): boolean {
  return !!state && Object.values(state.items).some((it) => it.n > 0);
}

/** Build a mode from its spec, filling in the defaults. The answer type `A` is erased for the app. */
export function defineMode<A extends string>(spec: ModeSpec<A>): UiMode {
  const { core } = spec;
  const lanes = spec.lanes ?? null;
  return {
    id: spec.id,
    title: spec.title,
    icon: spec.icon,
    blurb: spec.blurb,
    group: spec.group,
    core,
    session: (spec.session ?? { engine: core.engine }) as unknown as SessionMode<string>,
    lanes,
    words: spec.words,
    groups: spec.groups ?? ((clefs) => (lanes === 'clefs' ? [...clefs] : Object.keys(core.engine.set.groups))),
    createPlay: spec.createPlay as unknown as UiMode['createPlay'],
    renderMap: spec.renderMap,
    counts: spec.counts ?? medalCounts,
    itemLabel: spec.itemLabel ?? ((id) => id),
    availability: spec.availability ?? (() => ({ ok: true })),
  };
}
