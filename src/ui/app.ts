import qrcode from 'qrcode-generator';
import { Synth } from '../audio/synth';
import { type Profile, ProgressCodeError, decodeProfile, encodeProgress } from '../core/codec';
import {
  type MasteryEvent,
  type StudentState,
  WEEKLY_GOAL,
  daysThisWeek,
  isDusty,
  level,
  newStudent,
  recall,
} from '../core/engine';
import { ITEMS, itemById } from '../core/items';
import { LETTER_GROUP, LETTER_ITEMS, LETTER_MATH_MODE, isLetterItemId, letterEngine, letterLabel } from '../core/letters';
import { type Clef, noteId } from '../core/music';
import { type Session, startSession, summarize } from '../core/session';
import {
  type ModeId,
  type Settings,
  clearState,
  loadSettings,
  loadState,
  requestPersistence,
  saveSettings,
  saveState,
} from '../core/storage';
import { masteryCounts, renderMasteryKeyboard } from '../render/keyboard';
import { clear, h } from './dom';
import { letterCounts, letterMathPlay, renderLetterMap } from './letterMath';
import { nameItPlay } from './nameIt';
import type { PlayShell } from './playShell';
import { renderThemePicker } from './themePicker';
import { durabilityCard, homeBanners } from './pwa';
import { getTheme } from '../core/themes';
import { clearFx, summaryShower } from './world/fx';
import { type IconName, icon, medal } from './world/icons';
import { renderMascot, setMood } from './world/mascots';
import type { Medal } from './world/playChrome';
import { setCalm, setWorldMode } from './world/world';

type Screen = 'home' | 'play' | 'letters' | 'summary' | 'map' | 'save' | 'import' | 'debug' | 'theme';
type ClefChoice = 'treble' | 'bass' | 'both';

const OFFSET_KEY = 'nrp:debug:clockOffset';

const clefsFor = (c: ClefChoice): Clef[] => (c === 'both' ? ['treble', 'bass'] : [c]);
const choiceOf = (clefs: Clef[]): ClefChoice => (clefs.length === 2 ? 'both' : clefs[0]!);
const itemLabel = (id: string) => {
  if (isLetterItemId(id)) return letterLabel(id);
  const item = itemById(id);
  return `${item.note.letter} (${item.clef} clef)`;
};

export class App {
  private state: StudentState;
  /** Letter Math has its own learner model (see src/core/letters.ts). */
  private letters: StudentState;
  private play: PlayShell | null = null;
  private settings: Settings;
  private synth = new Synth();
  private session: Session | null = null;
  private screen: Screen = 'home';
  private importCode = '';
  private readonly debug: boolean;

  constructor(private root: HTMLElement) {
    this.state = loadState(localStorage);
    this.letters = loadState(localStorage, letterEngine);
    this.settings = loadSettings(localStorage);
    this.synth.muted = this.settings.muted;
    setCalm(!!this.settings.calm);
    this.debug = new URLSearchParams(location.search).has('debug');
    document.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('pointerdown', () => this.synth.unlock(), { capture: true });
    void requestPersistence();

    const m = /^#import=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (m) {
      this.importCode = m[1]!;
      history.replaceState(null, '', location.pathname + location.search);
      this.go('import');
    } else this.go('home');
  }

  private now(): number {
    return Date.now() + Number(localStorage.getItem(OFFSET_KEY) ?? 0);
  }

  private save(): void {
    saveState(localStorage, this.state);
    saveState(localStorage, this.letters, letterEngine);
  }

  private go(screen: Screen): void {
    this.play?.dispose();
    this.play = null;
    clearFx();
    this.screen = screen;
    clear(this.root);
    this.root.dataset.screen = screen;
    setWorldMode(screen);
    const render = {
      home: () => this.renderHome(),
      play: () => this.renderPlay(),
      letters: () => this.renderPlay(),
      summary: () => this.renderSummary(),
      map: () => this.renderMap(),
      save: () => this.renderSave(),
      import: () => this.renderImport(),
      debug: () => this.renderDebug(),
      theme: () =>
        renderThemePicker({
          settings: this.settings,
          save: () => {
            saveSettings(localStorage, this.settings);
            setCalm(!!this.settings.calm);
          },
          onDone: () => this.go('home'),
        }),
    }[screen];
    this.root.append(render());
    (this.root.querySelector('[data-autofocus]') as HTMLElement | null)?.focus();
  }

  // ───────────────────────── shared bits ─────────────────────────

  private muteButton(): HTMLElement {
    return h(
      'button',
      {
        class: 'icon-btn',
        'aria-label': this.settings.muted ? 'Turn sound on' : 'Turn sound off',
        'aria-pressed': String(this.settings.muted),
        onClick: (e: Event) => {
          this.settings.muted = !this.settings.muted;
          this.synth.muted = this.settings.muted;
          saveSettings(localStorage, this.settings);
          const btn = e.currentTarget as HTMLElement;
          btn.replaceChildren(icon(this.settings.muted ? 'soundOff' : 'soundOn'));
          btn.setAttribute('aria-label', this.settings.muted ? 'Turn sound on' : 'Turn sound off');
          btn.setAttribute('aria-pressed', String(this.settings.muted));
        },
      },
      icon(this.settings.muted ? 'soundOff' : 'soundOn'),
    );
  }

  private backButton(): HTMLElement {
    return h('button', { class: 'icon-btn', 'aria-label': 'Back', onClick: () => this.go('home') }, icon('back'));
  }

  private weeklyGoal(): HTMLElement {
    const days = daysThisWeek([this.state, this.letters], this.now());
    const dots = Array.from({ length: WEEKLY_GOAL }, (_, i) =>
      h('span', { class: `dot ${i < days ? 'dot--on' : ''}`, 'aria-hidden': 'true' }),
    );
    return h(
      'div',
      { class: 'weekly', 'data-testid': 'weekly-goal' },
      h('span', { class: 'weekly__label' }, 'This week'),
      h('span', { class: 'weekly__dots' }, ...dots),
      h('span', { class: 'weekly__text' }, days >= WEEKLY_GOAL && icon('star', 'weekly__star'), days >= WEEKLY_GOAL ? `Goal met! (${days} days)` : `${days} of ${WEEKLY_GOAL} days`),
    );
  }

  private toast(text: string, kind: string): void {
    let host = document.querySelector('.toasts');
    if (!host) document.body.append((host = h('div', { class: 'toasts', 'aria-live': 'polite' })));
    const badge = kind === 'gold' || kind === 'silver' ? medal(kind, 'toast__medal') : kind === 'polish' ? icon('sparkle', 'toast__icon') : kind === 'unlock' ? icon('lock', 'toast__icon') : null;
    const t = h('div', { class: `toast toast--${kind}` }, badge, h('span', {}, text));
    host.append(t);
    window.setTimeout(() => t.classList.add('toast--out'), 2600);
    window.setTimeout(() => t.remove(), 3200);
  }

  private announce(events: MasteryEvent[]): void {
    for (const e of events) {
      const label = itemLabel(e.itemId);
      const lm = isLetterItemId(e.itemId);
      const key = lm ? '' : ' key';
      if (e.kind === 'silver') this.toast(`Silver${key}: ${label}!`, 'silver');
      if (e.kind === 'gold') this.toast(`Gold${key}: ${label}! You remembered it on a new day.`, 'gold');
      if (e.kind === 'polished') this.toast(`Polished: ${label}`, 'polish');
    }
    // One answer can open several items (the fast track): one toast, one screen-reader announcement.
    const unlocked = events.filter((e) => e.kind === 'unlocked');
    if (unlocked.length > 0) {
      const noun = isLetterItemId(unlocked[0]!.itemId) ? 'question' : 'note';
      this.toast(
        unlocked.length === 1 ? `A new ${noun} is coming up!` : `${unlocked.length} new ${noun}s are coming up!`,
        'unlock',
      );
    }
    if (events.some((e) => e.kind === 'gold')) this.synth.fanfare(true);
    else if (events.some((e) => e.kind === 'silver')) this.synth.fanfare(false);
  }

  // ───────────────────────── home ─────────────────────────

  private renderHome(): HTMLElement {
    const choice = choiceOf(this.settings.clefs);
    const clefBtn = (c: ClefChoice, label: string) =>
      h(
        'button',
        {
          class: `seg ${choice === c ? 'seg--on' : ''}`,
          'aria-pressed': String(choice === c),
          onClick: () => {
            this.settings.clefs = clefsFor(c);
            saveSettings(localStorage, this.settings);
            this.go('home');
          },
        },
        label,
      );

    const counts = masteryCounts(this.state);
    const theme = getTheme(document.documentElement.dataset.theme);
    const navBtn = (name: IconName, label: string, onClick: () => void, ...extra: (Node | false)[]) =>
      h('button', { class: 'secondary', onClick }, icon(name, 'btn-icon'), h('span', {}, label), ...extra);

    return h(
      'main',
      { class: 'screen home' },
      h('header', { class: 'topbar' }, h('h1', { class: 'title title--brand' }, h('span', { class: 'logo' }, icon('note')), 'Note Reader'), this.muteButton()),
      homeBanners({ hasProgress: [this.state, this.letters].some((s) => Object.values(s.items).some((i) => i.n > 0)), onLoadCode: () => this.go('save') }),
      h(
        'div',
        { class: 'home-main' },
        h(
          'div',
          { class: 'hero' },
          h('p', { class: 'bubble' }, theme.greeting),
          renderMascot(theme.id, { mood: 'idle', alive: true, label: theme.mascot, cls: 'hero__mascot' }),
        ),
        h(
          'section',
          { class: 'card practice' },
          this.weeklyGoal(),
          h('h2', {}, 'What do you want to practice?'),
          this.modePicker(),
          this.settings.mode === 'letters'
            ? h('p', { class: 'muted' }, 'Next letter, skips, and intervals. No staff needed!')
            : h('div', { class: 'segmented', role: 'group', 'aria-label': 'Clef' }, clefBtn('treble', 'Treble'), clefBtn('bass', 'Bass'), clefBtn('both', 'Both')),
          h('button', { class: 'primary big start', 'data-autofocus': true, onClick: () => this.startPlay() }, h('span', {}, 'Start'), icon('play', 'btn-icon')),
        ),
      ),
      h(
        'nav',
        { class: 'home-nav' },
        navBtn('keyboard', 'My keyboard', () => this.go('map'), this.medalPill(counts.gold, counts.silver)),
        navBtn('save', 'Save / load progress', () => this.go('save')),
        navBtn('palette', 'Theme', () => this.go('theme')),
        this.debug && navBtn('wrench', 'Debug', () => this.go('debug')),
      ),
    );
  }

  private medalPill(gold: number, silver: number): HTMLElement {
    return h(
      'span',
      { class: 'pill', 'aria-label': `${gold} gold, ${silver} silver` },
      medal('gold', 'pill__medal'),
      String(gold),
      medal('silver', 'pill__medal'),
      String(silver),
    );
  }

  /** Game mode choice (Name It / Letter Math), remembered in Settings. */
  private modePicker(): HTMLElement {
    const mode = this.settings.mode ?? 'name';
    const btn = (m: ModeId, label: string) =>
      h(
        'button',
        {
          class: `seg ${mode === m ? 'seg--on' : ''}`,
          'aria-pressed': String(mode === m),
          onClick: () => {
            this.settings.mode = m;
            saveSettings(localStorage, this.settings);
            this.go('home');
          },
        },
        icon(m === 'name' ? 'note' : 'letters', 'seg__icon'),
        label,
      );
    return h('div', { class: 'segmented', role: 'group', 'aria-label': 'Game' }, btn('name', 'Name It'), btn('letters', 'Letter Math'));
  }

  // ───────────────────────── play ─────────────────────────

  private startPlay(): void {
    this.synth.unlock();
    if (this.settings.mode === 'letters') {
      this.session = startSession([LETTER_GROUP], undefined, LETTER_MATH_MODE);
      return this.go('letters');
    }
    this.session = startSession(this.settings.clefs);
    this.go('play');
  }

  private renderPlay(): HTMLElement {
    const lm = this.screen === 'letters';
    const host = {
      session: this.session!,
      state: lm ? this.letters : this.state,
      now: () => this.now(),
      save: () => this.save(),
      announce: (events: MasteryEvent[]) => this.announce(events),
      muteButton: () => this.muteButton(),
      quit: () => this.go('home'),
      finish: () => this.go('summary'),
      stopSound: () => this.synth.stopAll(),
    };
    this.play = lm ? letterMathPlay(host, this.synth) : nameItPlay(host, this.synth);
    return this.play.render();
  }

  private onKey(e: KeyboardEvent): void {
    this.play?.onKey(e);
  }

  // ───────────────────────── summary ─────────────────────────

  private renderSummary(): HTMLElement {
    const s = summarize(this.session!);
    const list = (title: string, ids: string[], kind: 'gold' | 'silver' | 'polish') =>
      ids.length > 0 &&
      h(
        'div',
        { class: `achv achv--${kind}` },
        h('h3', {}, kind === 'polish' ? icon('sparkle', 'achv__icon') : medal(kind, 'achv__icon'), title),
        h('ul', { class: 'chips' }, ...[...new Set(ids)].map((id) => h('li', { class: `chip chip--${kind}` }, itemLabel(id)))),
      );
    const anything = s.newGold.length + s.newSilver.length + s.polished.length > 0;
    const big: Medal = s.newGold.length ? 'gold' : s.newSilver.length ? 'silver' : null;
    const lm = this.session!.mode === LETTER_MATH_MODE;
    const keys = lm ? '' : ' keys';
    const theme = getTheme(document.documentElement.dataset.theme);
    const mascot = renderMascot(theme.id, { mood: 'happy', alive: true, cls: 'summary__mascot' });
    // Celebrate in proportion to real progress: confetti and a cheer only for new silver/gold (D12).
    requestAnimationFrame(() => {
      if (!mascot.isConnected) return;
      if (big) {
        setMood(mascot, 'cheer');
        summaryShower(big);
      } else setMood(mascot, 'happy');
    });
    return h(
      'main',
      { class: 'screen summary' },
      h('header', { class: 'topbar' }, h('h1', { class: 'title' }, 'Nice practice!'), this.muteButton()),
      h(
        'section',
        { class: `card summary-hero${big ? ` summary-hero--${big}` : ''}` },
        h('div', { class: 'summary-hero__art', 'aria-hidden': 'true' }, h('div', { class: 'summary-hero__rays' }), mascot),
        h(
          'div',
          { class: 'summary-hero__text' },
          h('p', { class: 'big-stat', 'data-testid': 'score' }, `${s.correct} of ${s.total} right`),
          anything
            ? h('div', { class: 'achvs' }, list(`New gold${keys}`, s.newGold, 'gold'), list(`New silver${keys}`, s.newSilver, 'silver'), list('Polished', s.polished, 'polish'))
            : h(
              'p',
              { class: 'muted' },
              lm
                ? 'Every practice makes your musical alphabet stronger. Squares turn silver when you know them well, and gold when you still know them on another day!'
                  : 'Every practice makes your notes stronger. Keys turn silver when you know them well, and gold when you still know them on another day!',
              ),
          s.unlocked.length > 0 &&
            h('p', { class: 'unlocked' }, icon('lock', 'unlocked__icon'), `You unlocked ${s.unlocked.length} new ${lm ? 'question' : 'note'}${s.unlocked.length > 1 ? 's' : ''}.`),
        ),
      ),
      h('section', { class: 'card card--slim' }, this.weeklyGoal()),
      h(
        'section',
        { class: 'card' },
        ...(lm ? [renderLetterMap(this.letters, this.now())] : this.settings.clefs.map((c) => h('div', { class: 'keys-frame' }, renderMasteryKeyboard(this.state, c, this.now())))),
      ),
      h(
        'nav',
        { class: 'row' },
        h('button', { class: 'primary big', 'data-autofocus': true, onClick: () => this.startPlay() }, 'Play again'),
        h('button', { class: 'secondary', onClick: () => this.go('home') }, 'Home'),
      ),
    );
  }

  // ───────────────────────── mastery map ─────────────────────────

  private renderMap(): HTMLElement {
    const now = this.now();
    const counts = masteryCounts(this.state);
    const dusty = ITEMS.filter((i) => isDusty(this.state.items[i.id]!, now)).length;
    const lmCounts = letterCounts(this.letters);
    return h(
      'main',
      { class: 'screen map' },
      h(
        'header',
        { class: 'topbar' },
        this.backButton(),
        h('h1', { class: 'title' }, icon('keyboard', 'title__icon'), 'My keyboard'),
        renderMascot(getTheme(document.documentElement.dataset.theme).id, { mood: 'happy', alive: true, cls: 'topbar__mascot' }),
      ),
      ...(['treble', 'bass'] as Clef[]).map((c) =>
        h(
          'section',
          { class: 'card' },
          h('h2', { class: 'map-head' }, h('span', {}, c === 'treble' ? 'Treble clef' : 'Bass clef')),
          h('div', { class: 'keys-frame' }, renderMasteryKeyboard(this.state, c, now)),
        ),
      ),
      h(
        'section',
        { class: 'card legend' },
        h('span', {}, h('i', { class: 'sw sw--gold' }), `Gold ${counts.gold}: you still knew it on another day`),
        h('span', {}, h('i', { class: 'sw sw--silver' }), `Silver ${counts.silver}: you know it fast`),
        h('span', {}, h('i', { class: 'sw sw--learning' }), `Learning ${counts.learning}: the bar grows as you learn`),
        h('span', {}, h('i', { class: 'sw sw--locked' }), `Coming soon ${counts.locked}`),
        dusty > 0 && h('span', {}, icon('sparkle', 'legend__icon'), `${dusty} key${dusty > 1 ? 's' : ''} could use a polish. Practice to make ${dusty > 1 ? 'them' : 'it'} shine again!`),
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'map-head' }, icon('letters', 'title__icon'), h('span', {}, 'Letter Math'), this.medalPill(lmCounts.gold, lmCounts.silver)),
        renderLetterMap(this.letters, now),
      ),
    );
  }

  // ───────────────────────── save / load ─────────────────────────

  private renderSave(): HTMLElement {
    const code = encodeProgress(this.state, this.now(), this.letters);
    const url = `${location.origin}${location.pathname}#import=${code}`;
    const qr = qrcode(0, 'L');
    qr.addData(url);
    qr.make();
    const qrHost = h('div', { class: 'qr', 'aria-label': 'QR code with your progress' });
    qrHost.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });

    const msg = h('p', { class: 'msg', 'aria-live': 'polite' });
    const input = h('textarea', { class: 'code-input', rows: 3, placeholder: 'Paste a progress code here', 'aria-label': 'Progress code to load' }) as HTMLTextAreaElement;

    return h(
      'main',
      { class: 'screen save' },
      h('header', { class: 'topbar' }, this.backButton(), h('h1', { class: 'title' }, icon('save', 'title__icon'), 'Save / load')),
      durabilityCard(),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Move your progress to another device'),
        h('p', { class: 'muted' }, 'Your progress is saved on this device. To continue on another one, scan this code with its camera, or copy the code below.'),
        qrHost,
        h('textarea', { class: 'code-output', readonly: true, rows: 3, 'aria-label': 'Your progress code', 'data-testid': 'progress-code', value: code }),
        h(
          'button',
          {
            class: 'secondary',
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(code);
                msg.textContent = 'Copied!';
              } catch {
                msg.textContent = 'Select the code above and copy it.';
              }
            },
          },
          'Copy code',
        ),
        msg,
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Load progress from another device'),
        input,
        h(
          'button',
          {
            class: 'secondary',
            onClick: () => {
              this.importCode = input.value.trim();
              if (this.importCode) this.go('import');
            },
          },
          'Load…',
        ),
      ),
    );
  }

  private renderImport(): HTMLElement {
    let incoming: Profile | null = null;
    let error = '';
    try {
      incoming = decodeProfile(this.importCode, this.now());
    } catch (e) {
      error = e instanceof ProgressCodeError ? e.message : 'That code didn’t work.';
    }
    const counts = incoming ? masteryCounts(incoming.name) : null;
    const lmCounts = incoming ? letterCounts(incoming.letters) : null;
    return h(
      'main',
      { class: 'screen import' },
      h('header', { class: 'topbar' }, h('h1', { class: 'title' }, icon('save', 'title__icon'), 'Load progress')),
      h(
        'section',
        { class: 'card' },
        incoming
          ? h(
              'div',
              {},
              h('p', {}, `This code has 🥇 ${counts!.gold} gold and 🥈 ${counts!.silver} silver keys.`),
              lmCounts!.gold + lmCounts!.silver > 0 &&
                h('p', {}, `Letter Math: 🥇 ${lmCounts!.gold} gold and 🥈 ${lmCounts!.silver} silver.`),
              h('p', { class: 'warn' }, 'Loading it will replace the progress on this device.'),
              h(
                'div',
                { class: 'row' },
                h(
                  'button',
                  {
                    class: 'primary',
                    'data-testid': 'confirm-import',
                    onClick: () => {
                      this.state = incoming!.name;
                      this.letters = incoming!.letters;
                      this.save();
                      this.toast('Progress loaded!', 'unlock');
                      this.go('home');
                    },
                  },
                  'Replace my progress',
                ),
                h('button', { class: 'secondary', onClick: () => this.go('home') }, 'Cancel'),
              ),
            )
          : h('div', {}, h('p', { class: 'warn', 'data-testid': 'import-error' }, error), h('button', { class: 'secondary', onClick: () => this.go('save') }, 'Back')),
      ),
    );
  }

  // ───────────────────────── debug (adults) ─────────────────────────

  private renderDebug(): HTMLElement {
    const now = this.now();
    const offsetDays = Number(localStorage.getItem(OFFSET_KEY) ?? 0) / 86_400_000;
    const entries = [
      ...ITEMS.map((i) => [`${i.clef[0]!.toUpperCase()} ${noteId(i.note)}`, this.state.items[i.id]!] as const),
      ...LETTER_ITEMS.map((i) => [`LM ${letterLabel(i.id)}`, this.letters.items[i.id]!] as const),
    ];
    const rows = entries.map(([label, it]) => {
      return h(
        'tr',
        { class: it.unlocked ? '' : 'dim' },
        h('td', {}, label),
        h('td', {}, level(it)),
        h('td', {}, recall(it, now).toFixed(2)),
        h('td', {}, it.m.toFixed(2)),
        h('td', {}, it.s.toFixed(1)),
        h('td', {}, `${it.c}/${it.n}`),
        h('td', {}, it.rt ? Math.round(it.rt) : '–'),
        h('td', {}, isDusty(it, now) ? 'dusty' : ''),
      );
    });
    const confusions = Object.entries(this.state.confusions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => {
        const [id, ans] = k.split('>');
        return `${itemLabel(id!)} → answered ${ans} ×${v}`;
      });
    const shift = (days: number) => () => {
      localStorage.setItem(OFFSET_KEY, String((offsetDays + days) * 86_400_000));
      this.go('debug');
    };
    return h(
      'main',
      { class: 'screen debug' },
      h('header', { class: 'topbar' }, this.backButton(), h('h1', { class: 'title' }, icon('wrench', 'title__icon'), 'Learner model')),
      h(
        'section',
        { class: 'card' },
        h('p', {}, `Personal speed baseline: Name It ${Math.round(this.state.rtBaseline)} ms, Letter Math ${Math.round(this.letters.rtBaseline)} ms · Clock offset: ${offsetDays} day(s)`),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'secondary', onClick: shift(1) }, '⏩ +1 day'),
          h('button', { class: 'secondary', onClick: shift(7) }, '⏩ +7 days'),
          h('button', { class: 'secondary', onClick: shift(-offsetDays) }, 'Reset clock'),
          h(
            'button',
            {
              class: 'secondary danger',
              onClick: () => {
                clearState(localStorage);
                clearState(localStorage, letterEngine);
                this.state = newStudent();
                this.letters = letterEngine.newStudent();
                this.go('debug');
              },
            },
            'Reset progress',
          ),
        ),
      ),
      h(
        'section',
        { class: 'card' },
        h(
          'table',
          { class: 'model' },
          h('thead', {}, h('tr', {}, ...['Item', 'Level', 'Recall now', 'Logit', 'Stability h', 'Right/Seen', 'Avg ms', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, ...rows),
        ),
      ),
      h('section', { class: 'card' }, h('h2', {}, 'Confusions'), confusions.length ? h('ul', {}, ...confusions.map((c) => h('li', {}, c))) : h('p', { class: 'muted' }, 'None yet.')),
    );
  }
}
