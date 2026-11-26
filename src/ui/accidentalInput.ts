// Answer inputs that can say "F♯" or "B♭" (issue #33, owner decision on #10): both styles, because they teach
// different things. The A–G pad with ♯/♭ modifiers teaches spelling and enharmonics; the 12-key keyboard
// builds the key relationship. They are AnswerInputs, so any mode can use them through PlayShell.
//
// Answers are note names without an octave (AnswerName: 'F', 'F#', 'Bb'). The keyboard has one key per
// pitch, so a black key answers with its sharp spelling ('C#'); a mode grades keyboard answers by
// pitch and pad answers by exact spelling (gradeAccidental).
//
// Pad input is modifier first, then letter: tap ♯ (or type #), then F. A bare letter is the natural and is
// submitted at once, so there is never a half-typed answer that could be submitted by mistake: the only
// pending state is "♯ armed", shown on the key, on every letter, in words, and to screen readers.

import {
  type Accidental,
  type AnswerName,
  type Letter,
  displayName,
  midi,
  parseAnswerName,
} from "../core/music";
import { h } from "./dom";
import type { AnswerInput } from "./letterPad";
import { type PianoMark, createPiano } from "./piano";
import "./accidentalInput.css";

const LETTER_ROW = ["A", "B", "C", "D", "E", "F", "G"] as const;
const isLetter = (k: string) => (LETTER_ROW as readonly string[]).includes(k);

export type InputStyle = "pad" | "keys";

/** Grading of an accidental answer: 'enharmonic' is the right key under another spelling (it counts as wrong). */
export type AccidentalGrade = "correct" | "enharmonic" | "wrong";

const pitchClass = (p: { letter: Letter; acc: Accidental }) =>
  midi({ letter: p.letter, octave: 4, acc: p.acc }) % 12;

/** `pad`: the spelling must match. `keys`: the pitch must match (a key has no spelling). */
export function gradeAccidental(
  style: InputStyle,
  answer: string,
  target: string,
): AccidentalGrade {
  const a = parseAnswerName(answer);
  const t = parseAnswerName(target);
  if (!a || !t) return "wrong";
  const samePitch = pitchClass(a) === pitchClass(t);
  if (style === "keys") return samePitch ? "correct" : "wrong";
  if (a.letter === t.letter && a.acc === t.acc) return "correct";
  return samePitch ? "enharmonic" : "wrong";
}

const shown = (name: string) => {
  const p = parseAnswerName(name);
  return p ? displayName({ letter: p.letter, octave: 4, acc: p.acc }) : name;
};

/** Gentle wording for an enharmonic answer: same key, different name. */
export function enharmonicFeedback(answer: string, target: string): string {
  return `${shown(answer)} and ${shown(target)} are the same key with different names. This note is written as ${shown(target)}.`;
}

export type Modifier = "sharp" | "flat";
const MOD_ID: Record<Modifier, string> = { sharp: "#", flat: "b" };
const MOD_SYMBOL: Record<Modifier, string> = { sharp: "♯", flat: "♭" };
const MOD_WORD: Record<Modifier, string> = { sharp: "sharp", flat: "flat" };

export interface AccidentalPad extends AnswerInput<AnswerName> {
  /** Show or hide the ♯/♭ modifiers (they appear once accidentals unlock). Clears any armed modifier. */
  setAccidentals(on: boolean): void;
  /** The modifier waiting for a letter, if any. */
  armed(): Modifier | null;
}

export interface AccidentalPadOptions {
  label: string;
  onAnswer: (answer: AnswerName | null) => void;
  /** The right answer for an item, as spelled on the staff. */
  target: (itemId: string) => AnswerName;
  /** Are accidentals unlocked? Read each time a question opens. Default: yes. */
  accidentals?: () => boolean;
}

/** The A–G + "?" pad with ♯/♭ modifier keys. With accidentals off it is the plain letter pad. */
export function accidentalPad(opts: AccidentalPadOptions): AccidentalPad {
  const unlocked = opts.accidentals ?? (() => true);
  let on = unlocked();
  let armed: Modifier | null = null;
  let enabled = true;

  const status = h("p", { class: "apad__status", role: "status" });
  const modButtons = (["sharp", "flat"] as const).map((m) =>
    h(
      "button",
      {
        class: "pad__key apad__mod",
        type: "button",
        "data-modifier": m,
        "aria-pressed": "false",
        "aria-label": MOD_WORD[m],
        onClick: () => arm(armed === m ? null : m),
      },
      MOD_SYMBOL[m],
    ),
  );
  const mods = h("div", { class: "apad__mods" }, ...modButtons, status);
  const letters = LETTER_ROW.map((l) =>
    h(
      "button",
      {
        class: "pad__key",
        type: "button",
        "data-answer": l,
        onClick: () => answer(l),
      },
      l,
    ),
  );
  const idk = h(
    "button",
    {
      class: "pad__key pad__idk",
      type: "button",
      "data-answer": "?",
      "aria-label": "I don't know",
      onClick: () => answer(null),
    },
    "?",
  );
  const el = h(
    "div",
    { class: "apad", role: "group", "aria-label": opts.label },
    mods,
    h("div", { class: "pad" }, ...letters, idk),
  );

  function paint() {
    mods.hidden = !on;
    el.classList.toggle("apad--armed", armed !== null);
    for (const b of modButtons) {
      const active = b.dataset.modifier === armed;
      b.setAttribute("aria-pressed", String(active));
      b.classList.toggle("apad__mod--on", active);
    }
    // Every letter shows what it would answer, so a pending ♯ is impossible to miss.
    for (const b of letters) {
      const l = b.dataset.answer!;
      b.textContent = armed ? `${l}${MOD_SYMBOL[armed]}` : l;
      b.setAttribute("aria-label", armed ? `${l} ${MOD_WORD[armed]}` : l);
    }
    status.textContent = armed
      ? `${MOD_SYMBOL[armed]} is on: now tap a letter`
      : "";
  }
  function arm(m: Modifier | null) {
    if (!on || !enabled) return;
    armed = m;
    paint();
  }
  /** One answer, built from the letter and whatever modifier is armed; null is "?". The modifier never outlives it. */
  function take(letter: string | null): AnswerName | null {
    const name =
      letter === null
        ? null
        : (`${letter}${on && armed ? MOD_ID[armed] : ""}` as AnswerName);
    armed = null;
    paint();
    return name;
  }
  function answer(letter: string | null) {
    opts.onAnswer(take(letter));
  }
  paint();

  const letterKey = (name: string) => {
    const p = parseAnswerName(name);
    return p
      ? el.querySelector<HTMLElement>(`.pad [data-answer="${p.letter}"]`)
      : null;
  };
  const modKey = (name: string) => {
    const acc = parseAnswerName(name)?.acc;
    const m: Modifier | null = acc === 1 ? "sharp" : acc === -1 ? "flat" : null;
    return m ? el.querySelector<HTMLElement>(`[data-modifier="${m}"]`) : null;
  };

  return {
    el,
    setAccidentals(next) {
      on = next;
      armed = null;
      paint();
    },
    armed: () => armed,
    ask() {
      on = unlocked();
      armed = null;
      paint();
    },
    setEnabled(next) {
      enabled = next;
      armed = null;
      paint();
      el.querySelectorAll<HTMLButtonElement>(".pad__key").forEach((b) => {
        b.disabled = !next;
        if (next) b.classList.remove("pad__key--right", "pad__key--wrong");
      });
    },
    markRight(itemId) {
      const t = opts.target(itemId);
      modKey(t)?.classList.add("pad__key--right");
      const b = letterKey(t);
      b?.classList.add("pad__key--right");
      return b;
    },
    markWrong(itemId, given) {
      const t = parseAnswerName(opts.target(itemId));
      const a = parseAnswerName(given);
      if (!a) return null;
      const wrongMod = a.acc !== (t?.acc ?? 0) ? modKey(given) : null;
      wrongMod?.classList.add("pad__key--wrong");
      if (a.letter === t?.letter && wrongMod) return wrongMod; // right letter, wrong modifier
      const b = letterKey(given);
      b?.classList.add("pad__key--wrong");
      return b;
    },
    fromKey(e) {
      const k = e.key;
      if (on && (k === "#" || k === "♯")) return (arm("sharp"), "handled");
      if (on && (k === "-" || k === "♭")) return (arm("flat"), "handled");
      if ((k === "Escape" || k === "Backspace") && armed)
        return (arm(null), "handled");
      const U = k.toUpperCase();
      const typed = isLetter(U) ? U : k === "?" || k === "/" ? null : undefined;
      if (typed === undefined) return undefined;
      return { answer: take(typed) }; // the shell submits it; the modifier is spent either way
    },
    dispose() {
      el.remove();
    },
  };
}

export interface KeyboardInputOptions {
  label: string;
  onAnswer: (answer: AnswerName | null) => void;
  target: (itemId: string) => AnswerName;
  /** Which keys say their names. Default 'all': this input teaches the name-to-key link. */
  labels?: "none" | "middleC" | "all";
}

/** The 12-key keyboard (C–B, black keys on) plus "?". Answers are pitches: a black key answers with its sharp name. */
export function keyboardInput(
  opts: KeyboardInputOptions,
): AnswerInput<AnswerName> {
  const piano = createPiano({
    low: "C4",
    high: "B4",
    labels: opts.labels ?? "all",
    onPress: (_m, id) => opts.onAnswer(id.replace(/\d+$/, "") as AnswerName),
  });
  const idk = h(
    "button",
    {
      class: "pad__key pad__idk kpad__idk",
      type: "button",
      "data-answer": "?",
      "aria-label": "I don't know",
      onClick: () => opts.onAnswer(null),
    },
    "?",
  );
  const el = h(
    "div",
    { class: "kpad", role: "group", "aria-label": opts.label },
    piano.el,
    idk,
  );
  const mark = (name: string, kind: PianoMark) => {
    const p = parseAnswerName(name);
    if (!p) return null;
    const m = 60 + pitchClass(p);
    piano.mark(m, kind);
    return el.querySelector<HTMLElement>(`.piano__key[data-midi="${m}"]`);
  };
  return {
    el,
    setEnabled(enabled) {
      piano.setEnabled(enabled);
      idk.disabled = !enabled;
      if (enabled) piano.clearMarks();
    },
    markRight: (id) => mark(opts.target(id), "right"),
    markWrong: (_id, answer) => mark(answer, "wrong"),
    fromKey(e) {
      // Typing a letter answers that natural. Black keys are reached with the arrow keys and Enter.
      const U = e.key.toUpperCase();
      if (isLetter(U)) return { answer: U as AnswerName };
      return e.key === "?" || e.key === "/" ? { answer: null } : undefined;
    },
    dispose() {
      piano.dispose();
      el.remove();
    },
  };
}

export interface SwitchableInputOptions {
  label: string;
  onAnswer: (answer: AnswerName | null) => void;
  target: (itemId: string) => AnswerName;
  accidentals?: () => boolean;
  /**
   * The mode may decide the style per item (spelling items on the pad, key-finding items on the keyboard).
   * Return undefined to leave it to the kid. When an item is decided, the switch is hidden for it.
   */
  styleFor?: (itemId: string) => InputStyle | undefined;
  /** The kid's starting choice (default 'pad'), and a callback so a mode can remember it. */
  initial?: InputStyle;
  onStyleChange?: (style: InputStyle) => void;
}

export interface SwitchableInput extends AnswerInput<AnswerName> {
  /** The style the current question uses: grade with gradeAccidental(style(), answer, target). */
  style(): InputStyle;
}

/** Both inputs with a "Letters | Keys" switch. Either the kid or the item chooses (see styleFor). */
export function switchableInput(opts: SwitchableInputOptions): SwitchableInput {
  let style: InputStyle = opts.initial ?? "pad";
  let forced = false;
  let enabled = true;
  const pad = accidentalPad(opts);
  const keys = keyboardInput(opts);
  const tabs = (["pad", "keys"] as const).map((s) =>
    h(
      "button",
      {
        class: "ainput__tab",
        type: "button",
        "data-style": s,
        onClick: () => choose(s),
      },
      s === "pad" ? "Letters" : "Keys",
    ),
  );
  const switcher = h(
    "div",
    { class: "ainput__switch", role: "group", "aria-label": "Answer with" },
    ...tabs,
  );
  const el = h("div", { class: "ainput" }, switcher, pad.el, keys.el);
  const active = () => (style === "pad" ? pad : keys);

  function paint() {
    pad.el.hidden = style !== "pad";
    keys.el.hidden = style !== "keys";
    switcher.hidden = forced;
    for (const t of tabs)
      t.setAttribute("aria-pressed", String(t.dataset.style === style));
  }
  function choose(s: InputStyle) {
    if (forced || !enabled || s === style) return;
    style = s;
    pad.ask?.(""); // a switch never leaves a modifier armed
    opts.onStyleChange?.(s);
    paint();
  }
  paint();

  return {
    el,
    style: () => style,
    ask(itemId) {
      const want = opts.styleFor?.(itemId);
      forced = want !== undefined;
      if (want) style = want;
      pad.ask?.(itemId);
      paint();
    },
    setEnabled(next) {
      enabled = next;
      for (const t of tabs) t.disabled = !next;
      pad.setEnabled(next);
      keys.setEnabled(next);
    },
    markRight: (id) => active().markRight(id),
    markWrong: (id, a) => active().markWrong(id, a),
    fromKey: (e) => active().fromKey(e),
    dispose() {
      pad.dispose?.();
      keys.dispose?.();
      el.remove();
    },
  };
}
