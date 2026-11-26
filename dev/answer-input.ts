// Dev-only harness for the accidental answer inputs (issue #33): shows an item name, takes an answer through
// switchableInput, grades it the way a mode would, and logs it. Nothing here ships.
import "../src/styles.css";
import type { AnswerName } from "../src/core/music";
import { bootTheme } from "../src/ui/theme";
import {
  type SwitchableInput,
  enharmonicFeedback,
  gradeAccidental,
  switchableInput,
} from "../src/ui/accidentalInput";

bootTheme();
const params = new URLSearchParams(location.search);
const unlocked = params.get("accidentals") !== "0";
const ITEMS: AnswerName[] = ["F#", "Bb", "C#", "Eb", "G", "A#"];
let n = 0;
let item = ITEMS[0]!;

const app = document.getElementById("app")!;
const prompt = document.createElement("h1");
prompt.dataset.testid = "demo-item";
const log = document.createElement("pre");
log.dataset.testid = "demo-log";
const input: SwitchableInput = switchableInput({
  label: "Answer",
  initial: params.get("style") === "keys" ? "keys" : "pad",
  accidentals: () => unlocked,
  target: () => item,
  styleFor: params.get("forced")
    ? (id) => (ITEMS.indexOf(id as AnswerName) % 2 === 0 ? "keys" : "pad")
    : undefined,
  onAnswer: submit,
});

let open = true;
function submit(answer: AnswerName | null) {
  if (!open) return;
  open = false;
  const grade =
    answer === null ? "idk" : gradeAccidental(input.style(), answer, item);
  log.textContent += `${item} <- ${answer ?? "?"} (${input.style()}): ${grade}${grade === "enharmonic" ? ` — ${enharmonicFeedback(answer!, item)}` : ""}\n`;
  if (answer !== null) input.markRight(item);
  if (grade === "wrong" || grade === "enharmonic")
    input.markWrong(item, answer!);
  input.setEnabled(false);
  setTimeout(next, 1200);
}

function next() {
  item = ITEMS[++n % ITEMS.length]!;
  prompt.textContent = `Name this note: ${item}`; // the demo shows the answer; real modes draw a staff
  input.ask?.(item);
  input.setEnabled(true);
  open = true;
}

document.addEventListener("keydown", (e) => {
  const r = input.fromKey(e);
  if (r === undefined) return;
  e.preventDefault();
  if (r !== "handled") submit(r.answer);
});

app.append(prompt, input.el, log);
input.ask?.(item);
prompt.textContent = `Name this note: ${item}`;
