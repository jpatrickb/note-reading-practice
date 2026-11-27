// Dev-only harness for the accidental answer inputs (issue #33). Nothing here ships (it is not in the build).
//
// Run:   npx vite --port 4196     then open   http://localhost:4196/dev/answer-input.html
// Query: ?accidentals=0   modifiers locked (the plain pad)
//        ?style=keys      start on the keyboard
//        ?forced=1        the mode fixes the style per item (alternating keys / pad): the default design
//        ?kid=1           opt-in: the kid gets a Letters | Keys switch
//        ?labels=unlabelled | middleC   keyboard labels
// Shows an item, takes an answer token ('pad:Db', 'keys:C#') through switchableInput, grades it with gradeToken
// (pure, no style lookups), and logs it. The e2e spec (e2e/accidental-input.spec.ts) measures this page.
import '../src/styles.css';
import type { AnswerName } from '../src/core/music';
import { type AccidentalAnswer, type SwitchableInput, enharmonicFeedback, gradeToken, switchableInput } from '../src/ui/accidentalInput';
import { bootTheme } from '../src/ui/theme';

bootTheme();
const params = new URLSearchParams(location.search);
const unlocked = params.get('accidentals') !== '0';
const ITEMS: AnswerName[] = ['F#', 'Bb', 'C#', 'Eb', 'G', 'A#'];
let n = 0;
let item = ITEMS[0]!;

const app = document.getElementById('app')!;
const prompt = document.createElement('h1');
prompt.dataset.testid = 'demo-item';
const log = document.createElement('pre');
log.dataset.testid = 'demo-log';
const labels = params.get('labels');
const input: SwitchableInput = switchableInput({
  label: 'Answer',
  initial: params.get('style') === 'keys' ? 'keys' : 'pad',
  accidentals: () => unlocked,
  target: () => item,
  keyLabels: labels === 'unlabelled' || labels === 'middleC' ? labels : 'all',
  kidChoice: !!params.get('kid'),
  styleFor: params.get('forced') ? (id) => (ITEMS.indexOf(id as AnswerName) % 2 === 0 ? 'keys' : 'pad') : undefined,
  onAnswer: submit,
});

let open = true;
function submit(answer: AccidentalAnswer | null) {
  if (!open) return;
  open = false;
  const grade = answer === null ? 'idk' : gradeToken(answer, item);
  log.textContent += `${item} <- ${answer ?? '?'}: ${grade}${grade === 'enharmonic' ? ` — ${enharmonicFeedback(answer!, item)}` : ''}\n`;
  input.markRight(item);
  if (answer !== null && grade !== 'correct') input.markWrong(item, answer);
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

document.addEventListener('keydown', (e) => {
  const r = input.fromKey(e);
  if (r === undefined) return;
  e.preventDefault();
  if (r !== 'handled') submit(r.answer);
});

app.append(prompt, input.el, log);
input.ask?.(item);
prompt.textContent = `Name this note: ${item}`;
