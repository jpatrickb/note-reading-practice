import { Synth } from '../audio/synth';
import { type DecodedCode, type Profile, ProgressCodeError, decodeProfileSections, encodeProfile, mergeImport } from '../core/codec';
import { type MasteryEvent, WEEKLY_GOAL, daysThisWeek, isDusty, level, recall } from '../core/engine';
import { codeFromHash, codeFromPasted, progressQr } from '../core/progress-qr';
import type { Clef } from '../core/music';
import { type PlacementRun, MAX_ANSWERS, applyPlacement, startPlacement } from '../core/placement';
import { placementLane } from '../core/placementFlow';
import { type Session, startSession, summarize } from '../core/session';
import {
  DEFAULT_MODE,
  type Settings,
  clearProfile,
  lanesFor,
  loadProfile,
  loadSettings,
  requestPersistence,
  saveProfile,
  saveSettings,
  saveState,
  setLanes,
} from '../core/storage';
import { clear, h } from './dom';
import { hasProgress, modeIcon, type UiMode } from './mode';
import { renderModeChooser } from './modeChooser';
import { renderPlacementOffer, renderPlacementResult } from './placementScreens';
import { modeById, registeredModes } from './modes';
import type { PlayHost, PlayShell } from './playShell';
import { renderThemePicker } from './themePicker';
import { durabilityCard, homeBanners } from './pwa';
import { getTheme } from '../core/themes';
import { clearFx, summaryShower } from './world/fx';
import { type IconName, icon, medal } from './world/icons';
import { renderMascot, setMood } from './world/mascots';
import type { Medal } from './world/playChrome';
import { setCalm, setWorldMode } from './world/world';

type Screen = 'home' | 'play' | 'summary' | 'map' | 'save' | 'import' | 'debug' | 'theme' | 'offer' | 'placed';
type ClefChoice = 'treble' | 'bass' | 'both';

const OFFSET_KEY = 'nrp:debug:clockOffset';

const clefsFor = (c: ClefChoice): Clef[] => (c === 'both' ? ['treble', 'bass'] : [c]);
const choiceOf = (clefs: readonly Clef[]): ClefChoice => (clefs.length === 2 ? 'both' : clefs[0]!);

export class App {
  /** Every mode's learner model, by mode id (see CORE_MODES). */
  private profile: Profile;
  private readonly modes: readonly UiMode[];
  /** The mode being played (or just played, for the summary) and the clefs it was started with. */
  private active: { mode: UiMode; clefs: Clef[] } | null = null;
  private play: PlayShell | null = null;
  private settings: Settings;
  private synth = new Synth();
  private session: Session<string> | null = null;
  private importCode = '';
  /** A placement round in progress (or just finished, for its result screen), and the lane it places. */
  private placing: { run: PlacementRun; lane: string; applied: boolean } | null = null;
  private readonly debug: boolean;

  constructor(private root: HTMLElement) {
    this.profile = loadProfile(localStorage);
    this.settings = loadSettings(localStorage);
    this.synth.muted = this.settings.muted;
    setCalm(!!this.settings.calm);
    this.debug = new URLSearchParams(location.search).has('debug');
    this.modes = registeredModes(this.debug);
    document.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('pointerdown', () => this.synth.unlock(), { capture: true });
    void requestPersistence();

    const linkedCode = codeFromHash(location.hash);
    if (linkedCode) {
      this.importCode = linkedCode;
      history.replaceState(null, '', location.pathname + location.search);
      this.go('import');
    } else this.go('home');
  }

  private now(): number {
    return Date.now() + Number(localStorage.getItem(OFFSET_KEY) ?? 0);
  }

  /** Save one mode's learner model (a play screen saves after every answer; only its own mode changed). */
  private saveMode(mode: UiMode): void {
    saveState(localStorage, this.profile[mode.core.id]!, mode.core.engine);
  }

  /** The mode the home screen has chosen: the saved one if it is known and open, else Name It. */
  private chosenMode(): UiMode {
    const mode = modeById(this.modes, this.settings.mode);
    return mode.availability(this.profile).ok ? mode : modeById(this.modes, DEFAULT_MODE);
  }

  /** Gold and silver across every mode with progress. */
  private totalCounts(): { gold: number; silver: number } {
    const total = { gold: 0, silver: 0 };
    for (const m of this.modes) {
      const state = this.profile[m.core.id];
      if (!state) continue;
      const c = m.counts(state);
      total.gold += c.gold;
      total.silver += c.silver;
    }
    return total;
  }

  private go(screen: Screen): void {
    this.play?.dispose();
    this.play = null;
    // Placement state lives only on the offer, the round and the result; any other screen drops it.
    if (screen !== 'offer' && screen !== 'play' && screen !== 'placed') this.placing = null;
    this.synth.stopAll(); // nothing keeps sounding on another screen, whatever the screen was
    clearFx();
    clear(this.root);
    this.root.dataset.screen = screen;
    setWorldMode(screen);
    const render = {
      home: () => this.renderHome(),
      play: () => this.renderPlay(),
      summary: () => this.renderSummary(),
      map: () => this.renderMap(),
      save: () => this.renderSave(),
      import: () => this.renderImport(),
      debug: () => this.renderDebug(),
      offer: () => this.renderOffer(),
      placed: () => this.renderPlaced(),
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
    const days = daysThisWeek(Object.values(this.profile), this.now());
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
    const { mode } = this.active!;
    const key = mode.words.medal ? ` ${mode.words.medal}` : '';
    for (const e of events) {
      const label = mode.itemLabel(e.itemId);
      if (e.kind === 'silver') this.toast(`Silver${key}: ${label}!`, 'silver');
      if (e.kind === 'gold') this.toast(`Gold${key}: ${label}! You remembered it on a new day.`, 'gold');
      if (e.kind === 'polished') this.toast(`Polished: ${label}`, 'polish');
    }
    // One answer can open several items (the fast track): one toast, one screen-reader announcement.
    const unlocked = events.filter((e) => e.kind === 'unlocked');
    if (unlocked.length > 0) {
      const noun = mode.words.item;
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
    const totals = this.totalCounts();
    const theme = getTheme(document.documentElement.dataset.theme);
    const navBtn = (name: IconName, label: string, onClick: () => void, ...extra: (Node | false)[]) =>
      h('button', { class: 'secondary', onClick }, icon(name, 'btn-icon'), h('span', {}, label), ...extra);

    return h(
      'main',
      { class: 'screen home' },
      h('header', { class: 'topbar' }, h('h1', { class: 'title title--brand' }, h('span', { class: 'logo' }, icon('note')), 'Note Reader'), this.muteButton()),
      homeBanners({ hasProgress: Object.values(this.profile).some((s) => hasProgress(s)), onLoadCode: () => this.go('save') }),
      h(
        'div',
        { class: 'home-main' },
        h(
          'div',
          { class: 'hero' },
          h('p', { class: 'bubble' }, theme.greeting),
          renderMascot(theme.id, { mood: 'idle', alive: true, label: theme.mascot, cls: 'hero__mascot' }),
        ),
        this.renderPractice(),
      ),
      h(
        'nav',
        { class: 'home-nav' },
        navBtn('star', 'My progress', () => this.go('map'), this.medalPill(totals.gold, totals.silver)),
        navBtn('save', 'Save / load progress', () => this.go('save')),
        navBtn('palette', 'Theme', () => this.go('theme')),
        this.debug && navBtn('wrench', 'Debug', () => this.go('debug')),
      ),
    );
  }

  /**
   * The "what do you want to practice?" card: the mode chooser, the clef picker for modes that have
   * clef lanes, and Start. Choosing redraws only this card (so a long list keeps its scroll place).
   */
  private renderPractice(): HTMLElement {
    const mode = this.chosenMode();
    const choice = choiceOf(lanesFor(this.settings, mode.id));
    const refresh = (focus: string) => {
      const next = this.renderPractice();
      practice.replaceWith(next);
      next.querySelector<HTMLElement>(focus)?.focus();
    };
    const clefBtn = (c: ClefChoice, label: string) =>
      h(
        'button',
        {
          class: `seg ${choice === c ? 'seg--on' : ''}`,
          'aria-pressed': String(choice === c),
          'data-clef': c,
          onClick: () => {
            setLanes(this.settings, mode.id, clefsFor(c));
            saveSettings(localStorage, this.settings);
            refresh(`[data-clef="${c}"]`);
          },
        },
        label,
      );

    const practice = h(
      'section',
      { class: 'card practice' },
      this.weeklyGoal(),
      h('h2', {}, 'What do you want to practice?'),
      renderModeChooser({
        modes: this.modes,
        profile: this.profile,
        selected: mode.id,
        onSelect: (id) => {
          this.settings.mode = id;
          saveSettings(localStorage, this.settings);
          refresh(`[data-mode="${id}"]`);
        },
      }),
      h(
        'div',
        { class: 'practice__go' },
        h('span', { class: 'practice__picked' }, mode.title),
        mode.lanes === 'clefs' && h('div', { class: 'segmented', role: 'group', 'aria-label': 'Clef' }, clefBtn('treble', 'Treble'), clefBtn('bass', 'Bass'), clefBtn('both', 'Both')),
        h('button', { class: 'primary big start', 'data-autofocus': true, onClick: () => this.startPlay(mode) }, h('span', {}, 'Start'), icon('play', 'btn-icon')),
      ),
    );
    return practice;
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

  // ───────────────────────── play ─────────────────────────

  /** Start practice. A mode that opts in offers placement first, on a lane with no progress only. */
  private startPlay(mode: UiMode, offer = true): void {
    this.synth.unlock();
    const clefs = lanesFor(this.settings, mode.id);
    this.active = { mode, clefs };
    this.placing = null;
    const lane = offer && mode.placement ? placementLane(mode.core.engine, this.profile[mode.core.id], mode.groups(clefs, this.profile)) : null;
    if (lane) {
      this.placing = { run: startPlacement(mode.core.engine, lane), lane, applied: false };
      return this.go('offer');
    }
    this.session = startSession(mode.groups(clefs, this.profile), undefined, mode.session);
    this.go('play');
  }

  private renderPlay(): HTMLElement {
    const { mode } = this.active!;
    const host: PlayHost = {
      session: this.session!,
      state: this.profile[mode.core.id]!,
      now: () => this.now(),
      save: () => this.saveMode(mode),
      announce: (events: MasteryEvent[]) => this.announce(events),
      muteButton: () => this.muteButton(),
      quit: () => this.go('home'),
      finish: () => this.go('summary'),
      stopSound: () => this.synth.stopAll(),
    };
    if (this.placing && !this.placing.applied) host.placement = { run: this.placing.run, done: () => this.finishPlacement() };
    this.play = mode.createPlay(host, { synth: this.synth, profile: this.profile });
    return this.play.render();
  }

  // ───────────────────────── placement ─────────────────────────

  private renderOffer(): HTMLElement {
    const { mode } = this.active!;
    return renderPlacementOffer({
      mode,
      lane: this.placing!.lane,
      onBack: () => this.go('home'),
      onBegin: () => this.startPlay(mode, false),
      // The round is the play screen with the run attached; nothing is saved until it finishes.
      onPlace: () => {
        this.session = startSession([this.placing!.lane], MAX_ANSWERS, mode.session);
        this.go('play');
      },
    });
  }

  /** The round is over: open the lane up to where the kid placed, then show where they start. */
  private finishPlacement(): void {
    const { mode } = this.active!;
    applyPlacement(mode.core.engine, this.profile[mode.core.id]!, this.placing!.run);
    this.saveMode(mode);
    this.placing!.applied = true;
    this.go('placed');
  }

  private renderPlaced(): HTMLElement {
    const { mode } = this.active!;
    return renderPlacementResult({ mode, run: this.placing!.run, onGo: () => this.startPlay(mode, false) });
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
        h('ul', { class: 'chips' }, ...[...new Set(ids)].map((id) => h('li', { class: `chip chip--${kind}` }, mode.itemLabel(id)))),
      );
    const anything = s.newGold.length + s.newSilver.length + s.polished.length > 0;
    const big: Medal = s.newGold.length ? 'gold' : s.newSilver.length ? 'silver' : null;
    const { mode, clefs } = this.active!;
    const keys = mode.words.medal ? ` ${mode.words.medal}s` : '';
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
            : h('p', { class: 'muted' }, mode.words.encourage),
          s.unlocked.length > 0 &&
            h('p', { class: 'unlocked' }, icon('lock', 'unlocked__icon'), `You unlocked ${s.unlocked.length} new ${mode.words.item}${s.unlocked.length > 1 ? 's' : ''}.`),
        ),
      ),
      h('section', { class: 'card card--slim' }, this.weeklyGoal()),
      h('section', { class: 'card' }, mode.renderMap(this.profile[mode.core.id]!, this.now(), { lanes: mode.lanes ? clefs : undefined })),
      h(
        'nav',
        { class: 'row' },
        h('button', { class: 'primary big', 'data-autofocus': true, onClick: () => this.startPlay(mode) }, 'Play again'),
        h('button', { class: 'secondary', onClick: () => this.go('home') }, 'Home'),
      ),
    );
  }

  // ───────────────────────── my progress ─────────────────────────

  /** One section per mode the kid has played, each drawing that mode's own map. */
  private renderMap(): HTMLElement {
    const now = this.now();
    const played = this.modes.filter((m) => hasProgress(this.profile[m.core.id]));
    return h(
      'main',
      { class: 'screen map' },
      h(
        'header',
        { class: 'topbar' },
        this.backButton(),
        h('h1', { class: 'title' }, icon('star', 'title__icon'), 'My progress'),
        renderMascot(getTheme(document.documentElement.dataset.theme).id, { mood: 'happy', alive: true, cls: 'topbar__mascot' }),
      ),
      ...played.map((m) => {
        const c = m.counts(this.profile[m.core.id]!);
        return h(
          'section',
          { class: 'card', 'data-mode': m.id },
          h('h2', { class: 'map-head' }, modeIcon(m, 'title__icon'), h('span', {}, m.title), this.medalPill(c.gold, c.silver)),
          m.renderMap(this.profile[m.core.id]!, now, { legend: true }),
        );
      }),
      played.length === 0 && h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Play a game and your progress will show up here!')),
    );
  }

  // ───────────────────────── save / load ─────────────────────────

  private renderSave(): HTMLElement {
    const code = encodeProfile(this.profile, this.now());
    const qr = progressQr(`${location.origin}${location.pathname}`, code);
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
              this.importCode = codeFromPasted(input.value);
              if (this.importCode) this.go('import');
            },
          },
          'Load…',
        ),
      ),
    );
  }

  private renderImport(): HTMLElement {
    let incoming: DecodedCode | null = null;
    let error = '';
    try {
      incoming = decodeProfileSections(this.importCode, this.now());
    } catch (e) {
      error = e instanceof ProgressCodeError ? e.message : 'That code didn’t work.';
    }
    // The modes this code carries progress for (a mode the kid never played has no section).
    const inCode = incoming ? this.modes.filter((m) => incoming!.present.includes(m.core.id)) : [];
    const kept = this.modes.filter((m) => !inCode.includes(m) && hasProgress(this.profile[m.core.id]));
    const names = (ms: readonly UiMode[]) => ms.map((m) => m.title).reduce((a, t, i, all) => (i === 0 ? t : `${a}${i === all.length - 1 ? ' and ' : ', '}${t}`), '');
    const swaps = inCode.filter((m) => hasProgress(this.profile[m.core.id]));
    const adds = inCode.filter((m) => !swaps.includes(m));
    const effect = [
      swaps.length > 0 ? `This swaps your ${names(swaps)} progress for the one in the code.` : '',
      adds.length > 0 ? `This adds ${names(adds)}.` : '',
      kept.length > 0 ? `Your ${names(kept)} progress stays.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const lessThanDevice = swaps.filter((m) => {
      const c = m.counts(incoming!.profile[m.core.id]!);
      const d = m.counts(this.profile[m.core.id]!);
      return c.gold < d.gold || (c.gold === d.gold && c.silver < d.silver);
    });
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
              h('p', {}, inCode.length > 0 ? 'This code has progress in:' : 'This code has no progress in it yet.'),
              h(
                'ul',
                { class: 'import-modes', 'data-testid': 'import-modes' },
                ...inCode.map((m) => {
                  const c = m.counts(incoming!.profile[m.core.id]!);
                  return h('li', { 'data-mode': m.id }, `${m.title}: 🥇 ${c.gold} gold and 🥈 ${c.silver} silver`);
                }),
              ),
              inCode.length > 0
                ? h('p', { class: 'warn', 'data-testid': 'import-effect' }, effect)
                : h('p', { class: 'muted', 'data-testid': 'import-effect' }, incoming.unreadable > 0 ? 'This code is from a newer version of the game, so this version can’t read it yet.' : 'Nothing on this device would change.'),
              ...lessThanDevice.map((m) => {
                const c = m.counts(incoming!.profile[m.core.id]!);
                const d = m.counts(this.profile[m.core.id]!);
                return h('p', { class: 'muted', 'data-testid': 'import-less', 'data-mode': m.id }, `Careful: this code has ${c.gold} gold and ${c.silver} silver in ${m.title}; this device has ${d.gold} and ${d.silver}.`);
              }),
              h(
                'div',
                { class: 'row' },
                inCode.length > 0 &&
                h(
                  'button',
                  {
                    class: 'primary',
                    'data-testid': 'confirm-import',
                    onClick: () => {
                      this.profile = mergeImport(this.profile, incoming!);
                      saveProfile(localStorage, this.profile);
                      this.toast(inCode.length > 0 ? `Progress loaded: ${inCode.map((m) => m.title).join(', ')}` : 'Progress loaded!', 'unlock');
                      this.go('home');
                    },
                  },
                  'Load this progress',
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
    const played = this.modes.filter((m) => this.profile[m.core.id]);
    const entries = played.flatMap((m) => m.core.engine.set.items.map((i) => [i.id, this.profile[m.core.id]!.items[i.id]!] as const));
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
    const confusions = played
      .flatMap((m) => Object.entries(this.profile[m.core.id]!.confusions).map(([k, v]) => [m, k, v] as const))
      .sort((a, b) => b[2] - a[2])
      .slice(0, 12)
      .map(([m, k, v]) => {
        const [id, ans] = k.split('>');
        return `${m.itemLabel(id!)} → answered ${ans} ×${v}`;
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
        h('p', {}, `Personal speed baseline: ${played.map((m) => `${m.title} ${Math.round(this.profile[m.core.id]!.rtBaseline)} ms`).join(', ')} · Clock offset: ${offsetDays} day(s)`),
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
                clearProfile(localStorage);
                this.profile = loadProfile(localStorage);
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
