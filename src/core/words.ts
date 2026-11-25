// The Word Decoder word lists: DATA ONLY, so a teacher can review and edit them without touching
// logic. Each list is in TEACHING order (easy first); the progress-code order is separate (see
// CANONICAL_ORDER in wordDecoder.ts) so editing a list never moves a saved record.
//
// House rules for every word:
//  - Only the letters A-G, 3-7 letters, an ordinary word a young reader knows or will meet soon.
//  - Original and kid-safe: no brand or trademark words, nothing unkind, scary, rude or easy to tease
//    (so no "deaf", "dead", "bad", "gag"...). When in doubt, leave it out.
//  - Teaching order follows Name It's teaching order for the clef (src/core/items.ts), so a word never
//    asks for a note the kid cannot have met: the first words use only letters from the first five
//    notes taught, and the letters taught later (treble: B, D; bass: C, B) come in after.
//  - Early on, words differ from each other and use different letters, so one answer button can't
//    carry play (D33); repeated letters (EGG, FADED) and long words come later.
//
// Name It teaches, per clef: treble G C A F E B D ...   bass F G E A D C B ...
// The notes shown for a letter come from the Name It notes the kid has at silver (so octaves vary,
// and ledger-line notes appear once they are silver there); see chooseNotes in wordDecoder.ts.

import type { Clef } from './music';

export const WORD_LISTS: Record<Clef, readonly string[]> = {
  treble: [
    // letters from G C A F E only
    'ACE', 'AGE', 'FACE', 'CAFE', 'EGG',
    // adds B
    'CAB', 'BAG', 'BEE', 'BEEF',
    // adds D
    'ADD', 'FED', 'BED', 'BEAD', 'FADE', 'EDGE', 'BADGE', 'DECAF', 'FACED',
    // six and seven letters
    'DECADE', 'FACADE', 'BAGGAGE', 'CABBAGE',
  ],
  bass: [
    // letters from F G E A D only
    'FED', 'AGED', 'FADE', 'FEED', 'ADD', 'EDGED', 'FADED', 'ADDED',
    // adds C, then B
    'ACE', 'FACE', 'BAGGED', 'BADGE',
  ],
};
