// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnswerName } from "../src/core/music";
import {
  type AccidentalPad,
  accidentalPad,
  enharmonicFeedback,
  gradeAccidental,
  keyboardInput,
  switchableInput,
} from "../src/ui/accidentalInput";

afterEach(() => {
  document.body.innerHTML = "";
});

const target = (id: string) => id as AnswerName; // items in these tests are their own answers
const kb = (key: string) => new KeyboardEvent("keydown", { key });
const q = (sel: string) => document.querySelector<HTMLButtonElement>(sel)!;
const letter = (l: string) => q(`.pad [data-answer="${l}"]`);
const mod = (m: string) => q(`[data-modifier="${m}"]`);

function mountPad(accidentals = true) {
  const onAnswer = vi.fn();
  const pad: AccidentalPad = accidentalPad({
    label: "Note names",
    onAnswer,
    target,
    accidentals: () => accidentals,
  });
  document.body.append(pad.el);
  return { pad, onAnswer };
}

describe("accidental pad", () => {
  it("hides the modifiers until accidentals unlock, and then behaves like the plain pad", () => {
    const { pad, onAnswer } = mountPad(false);
    expect(mod("sharp").closest<HTMLElement>(".apad__mods")!.hidden).toBe(true);
    expect(pad.fromKey(kb("#"))).toBeUndefined();
    expect(pad.fromKey(kb("-"))).toBeUndefined();
    expect(pad.fromKey(kb("f"))).toEqual({ answer: "F" });
    letter("G").click();
    expect(onAnswer).toHaveBeenCalledWith("G");
    pad.setAccidentals(true);
    expect(mod("sharp").closest<HTMLElement>(".apad__mods")!.hidden).toBe(
      false,
    );
  });

  it("tapping a modifier never answers; the letter after it does", () => {
    const { pad, onAnswer } = mountPad();
    mod("sharp").click();
    expect(onAnswer).not.toHaveBeenCalled();
    expect(pad.armed()).toBe("sharp");
    letter("F").click();
    expect(onAnswer).toHaveBeenCalledOnce();
    expect(onAnswer).toHaveBeenCalledWith("F#");
    expect(pad.armed()).toBeNull();
  });

  it("a bare letter is the natural, and a flat is B♭ not B", () => {
    const { onAnswer } = mountPad();
    letter("B").click();
    expect(onAnswer).toHaveBeenLastCalledWith("B");
    mod("flat").click();
    letter("B").click();
    expect(onAnswer).toHaveBeenLastCalledWith("Bb");
  });

  it("shows the pending modifier everywhere: pressed key, letters, words, and aria", () => {
    const { pad } = mountPad();
    mod("sharp").click();
    expect(mod("sharp").getAttribute("aria-pressed")).toBe("true");
    expect(mod("flat").getAttribute("aria-pressed")).toBe("false");
    expect(letter("F").textContent).toBe("F♯");
    expect(letter("F").getAttribute("aria-label")).toBe("F sharp");
    expect(q(".apad__status").textContent).toContain("♯");
    expect(q(".apad__status").getAttribute("role")).toBe("status");
    mod("sharp").click(); // tapping it again turns it off
    expect(pad.armed()).toBeNull();
    expect(letter("F").textContent).toBe("F");
    expect(q(".apad__status").textContent).toBe("");
  });

  it("typing: # then F is F♯ (and only on the second key); - is flat", () => {
    const { pad } = mountPad();
    expect(pad.fromKey(kb("#"))).toBe("handled"); // partial: nothing is submitted
    expect(pad.armed()).toBe("sharp");
    expect(pad.fromKey(kb("f"))).toEqual({ answer: "F#" });
    expect(pad.armed()).toBeNull();
    expect(pad.fromKey(kb("-"))).toBe("handled");
    expect(pad.fromKey(kb("B"))).toEqual({ answer: "Bb" });
  });

  it('Escape, Backspace, "?" and a new question all clear a pending modifier; "?" is never a note', () => {
    const { pad, onAnswer } = mountPad();
    pad.fromKey(kb("#"));
    expect(pad.fromKey(kb("Escape"))).toBe("handled");
    expect(pad.armed()).toBeNull();
    expect(pad.fromKey(kb("Escape"))).toBeUndefined(); // nothing pending: Escape is not ours
    pad.fromKey(kb("#"));
    expect(pad.fromKey(kb("?"))).toEqual({ answer: null });
    expect(pad.armed()).toBeNull();
    mod("flat").click();
    q(".pad__idk").click();
    expect(onAnswer).toHaveBeenLastCalledWith(null);
    expect(pad.armed()).toBeNull();
    mod("flat").click();
    pad.setEnabled(false);
    pad.setEnabled(true);
    expect(pad.armed()).toBeNull();
    mod("sharp").click();
    pad.ask?.("F");
    expect(pad.armed()).toBeNull();
  });

  it("a disabled pad ignores modifiers", () => {
    const { pad } = mountPad();
    pad.setEnabled(false);
    expect(mod("sharp").disabled).toBe(true);
    expect(pad.fromKey(kb("#"))).toBe("handled"); // consumed, but nothing is armed
    expect(pad.armed()).toBeNull();
  });

  it("marks the right letter and modifier, and the wrong one, with the element to react on", () => {
    const { pad } = mountPad();
    expect(pad.markRight("F#")).toBe(letter("F"));
    expect(letter("F").classList.contains("pad__key--right")).toBe(true);
    expect(mod("sharp").classList.contains("pad__key--right")).toBe(true);
    // F♯ was written; the kid said F♭: right letter, wrong modifier
    expect(pad.markWrong("F#", "Fb")).toBe(mod("flat"));
    expect(mod("flat").classList.contains("pad__key--wrong")).toBe(true);
    expect(letter("F").classList.contains("pad__key--wrong")).toBe(false);
    // ...or the plain F: right letter, no modifier to mark, so the letter is the element
    pad.setEnabled(true);
    expect(pad.markWrong("F#", "F")).toBe(letter("F"));
    pad.setEnabled(true);
    expect(pad.markWrong("F#", "G")).toBe(letter("G"));
    expect(letter("G").classList.contains("pad__key--wrong")).toBe(true);
  });

  it("every control is at least 44px by CSS contract (the pad key and modifier classes)", () => {
    mountPad();
    expect(mod("sharp").classList.contains("pad__key")).toBe(true); // .pad__key min-height 72px
    expect(mod("sharp").classList.contains("apad__mod")).toBe(true); // min 72x56
  });
});

describe("12-key keyboard", () => {
  function mount() {
    const onAnswer = vi.fn();
    const input = keyboardInput({ label: "Keys", onAnswer, target });
    document.body.append(input.el);
    return { input, onAnswer };
  }
  const key = (id: string) => q(`.piano__key[data-note="${id}"]`);

  it("has 7 white and 5 black keys; black keys answer with their sharp name", () => {
    const { onAnswer } = mount();
    expect(document.querySelectorAll(".piano__key--white")).toHaveLength(7);
    expect(document.querySelectorAll(".piano__key--black")).toHaveLength(5);
    key("C#4").click();
    expect(onAnswer).toHaveBeenLastCalledWith("C#");
    key("E4").click();
    expect(onAnswer).toHaveBeenLastCalledWith("E");
    q('.kpad [data-answer="?"]').click();
    expect(onAnswer).toHaveBeenLastCalledWith(null);
  });

  it("shows the right key by pitch whichever way the note is spelled (B♭ lights the A♯ key)", () => {
    const { input } = mount();
    expect(input.markRight("Bb")).toBe(key("A#4"));
    expect(key("A#4").dataset.mark).toBe("right");
    expect(input.markWrong("Bb", "B")).toBe(key("B4"));
    expect(key("B4").dataset.mark).toBe("wrong");
    input.setEnabled(true);
    expect(document.querySelector("[data-mark]")).toBeNull();
  });

  it('typing a letter answers that natural; "?" is I do not know; other keys are not ours', () => {
    const { input } = mount();
    expect(input.fromKey(kb("d"))).toEqual({ answer: "D" });
    expect(input.fromKey(kb("?"))).toEqual({ answer: null });
    expect(input.fromKey(kb("x"))).toBeUndefined();
  });
});

describe("switchable input", () => {
  function mount(styleFor?: (id: string) => "pad" | "keys" | undefined) {
    const onAnswer = vi.fn();
    const onStyleChange = vi.fn();
    const input = switchableInput({
      label: "Answer",
      onAnswer,
      target,
      styleFor,
      onStyleChange,
    });
    document.body.append(input.el);
    return { input, onAnswer, onStyleChange };
  }
  const tab = (s: string) => q(`[data-style="${s}"]`);

  it("starts on the pad; the kid switches to the keys and back, and the mode hears about it", () => {
    const { input, onStyleChange } = mount();
    input.ask?.("F#");
    expect(input.style()).toBe("pad");
    expect(q(".apad").hidden).toBe(false);
    expect(q(".kpad").hidden).toBe(true);
    tab("keys").click();
    expect(input.style()).toBe("keys");
    expect(q(".apad").hidden).toBe(true);
    expect(q(".kpad").hidden).toBe(false);
    expect(tab("keys").getAttribute("aria-pressed")).toBe("true");
    expect(tab("pad").getAttribute("aria-pressed")).toBe("false");
    expect(onStyleChange).toHaveBeenLastCalledWith("keys");
    tab("pad").click();
    expect(onStyleChange).toHaveBeenCalledTimes(2);
  });

  it("switching clears a pending modifier, and cannot happen mid-feedback", () => {
    const { input } = mount();
    input.ask?.("F#");
    mod("sharp").click();
    tab("keys").click();
    tab("pad").click();
    expect(letter("F").textContent).toBe("F");
    input.setEnabled(false);
    tab("keys").click(); // disabled: ignored
    expect(input.style()).toBe("pad");
  });

  it("the mode can pick the style per item, which hides the switch for that item", () => {
    const { input } = mount((id) =>
      id === "F#" ? "keys" : id === "Bb" ? "pad" : undefined,
    );
    input.ask?.("F#");
    expect(input.style()).toBe("keys");
    expect(q(".ainput__switch").hidden).toBe(true);
    input.ask?.("Bb");
    expect(input.style()).toBe("pad");
    expect(q(".ainput__switch").hidden).toBe(true);
    input.ask?.("C"); // undecided: the switch comes back
    expect(q(".ainput__switch").hidden).toBe(false);
  });

  it("marks and typing go to the style in use", () => {
    const { input } = mount();
    input.ask?.("F#");
    tab("keys").click();
    expect(input.markRight("F#")).toBe(q('.piano__key[data-note="F#4"]'));
    input.setEnabled(true);
    expect(input.fromKey(kb("#"))).toBeUndefined(); // the keyboard has no modifiers
    tab("pad").click();
    expect(input.fromKey(kb("#"))).toBe("handled");
  });
});

describe("grading", () => {
  it("pad: the spelling must match; the same key under another name is enharmonic (counts wrong)", () => {
    expect(gradeAccidental("pad", "F#", "F#")).toBe("correct");
    expect(gradeAccidental("pad", "Gb", "F#")).toBe("enharmonic");
    expect(gradeAccidental("pad", "F", "F#")).toBe("wrong");
    expect(gradeAccidental("pad", "E#", "F")).toBe("enharmonic");
    expect(gradeAccidental("pad", "?", "F")).toBe("wrong");
  });

  it("keys: the pitch must match", () => {
    expect(gradeAccidental("keys", "A#", "Bb")).toBe("correct");
    expect(gradeAccidental("keys", "B", "Bb")).toBe("wrong");
  });

  it("the enharmonic feedback is gentle and uses the real symbols", () => {
    expect(enharmonicFeedback("Gb", "F#")).toBe(
      "G♭ and F♯ are the same key with different names. This note is written as F♯.",
    );
  });
});
