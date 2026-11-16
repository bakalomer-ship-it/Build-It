// The plan of a 2x2 klaf (קלף 2×2): which poles, where they meet, and which
// lashing each meeting takes. Level 1 builds one; level 2 builds two of them.
// Sizes come from blueprints.js. Coordinates are in metres in the klaf's own
// plane: u runs across the klaf (−1 … +1), v runs up from the ground (0 … 2).

export const LASHINGS = {
  square:   { he: 'כפיתה מרובעת', short: 'מרובעת' },
  cross:    { he: 'כפיתה אלכסונית', short: 'אלכסונית' },
  parallel: { he: 'כפיתה מקבילה', short: 'מקבילה' },
  tripod:   { he: 'כפיתת חצובה',  short: 'חצובה' },
  // special lashing used only to fix a guy line to its stake (Omer);
  // (Omer: it is called קיבוע)
  guy:      { he: 'קיבוע', short: 'קיבוע' },
};
// The four lashings the picker offers on poles, as on the mockup Omer
// confirmed: מרובעת, אלכסונית, מקבילה, חצובה.
export const LASHING_ORDER = ['square', 'cross', 'parallel', 'tripod'];
// On a guy line the picker also offers the guy-line lashing.
export const GUY_LASHING_ORDER = ['guy', 'square', 'cross', 'parallel', 'tripod'];

import { SIZES } from './blueprints.js';
const K = SIZES.klaf;
const LEG_U = K.legSpacing / 2;
const BOTTOM_V = K.bottomHeight;  // bottom horizontal 30 cm above the ground (Omer)
const TOP_V = K.topHeight;
const DIAG_LO = K.diagLow, DIAG_HI = K.diagHigh;
const diagCentreV = (DIAG_LO + DIAG_HI) / 2;
const diagLen = K.diagLength;

function dir(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy); return [dx / l, dy / l]; }

// Each slot is one pole in the drawing: a centre line and a planned length.
// layer: which face of the klaf the pole lies on (for drawing only).
export const SLOTS = [
  { id: 'legR', he: 'רגל שמאל',      centre: [ LEG_U, K.legLength / 2], dir: [0, 1], length: K.legLength, layer: 0 },
  { id: 'legL', he: 'רגל ימין',      centre: [-LEG_U, K.legLength / 2], dir: [0, 1], length: K.legLength, layer: 0 },
  { id: 'botH', he: 'רוחב תחתון',    centre: [0, BOTTOM_V], dir: [1, 0], length: K.horizontalLength, layer: 1 },
  { id: 'topH', he: 'רוחב עליון',    centre: [0, TOP_V],    dir: [1, 0], length: K.horizontalLength, layer: 1 },
  { id: 'diagA', he: 'אלכסון (שמאל־למעלה עד ימין־למטה)',        centre: [0, diagCentreV], dir: dir([-LEG_U, DIAG_LO], [LEG_U, DIAG_HI]), length: diagLen, layer: -1 },
  { id: 'diagB', he: 'אלכסון (ימין־למעלה עד שמאל־למטה)', centre: [0, diagCentreV], dir: dir([LEG_U, DIAG_LO], [-LEG_U, DIAG_HI]), length: diagLen, layer: -1 },
];

// Joints in the drawing. `correct` is the lashing the rules call for.
export const JOINTS = [
  { id: 'J1', a: 'legL', b: 'botH', at: [-LEG_U, BOTTOM_V], correct: 'square' },
  { id: 'J2', a: 'legR', b: 'botH', at: [ LEG_U, BOTTOM_V], correct: 'square' },
  { id: 'J3', a: 'legL', b: 'topH', at: [-LEG_U, TOP_V],    correct: 'square' },
  { id: 'J4', a: 'legR', b: 'topH', at: [ LEG_U, TOP_V],    correct: 'square' },
  { id: 'J5', a: 'legL', b: 'diagA', at: [-LEG_U, DIAG_LO], correct: 'cross' },
  { id: 'J6', a: 'legR', b: 'diagA', at: [ LEG_U, DIAG_HI], correct: 'cross' },
  { id: 'J7', a: 'legR', b: 'diagB', at: [ LEG_U, DIAG_LO], correct: 'cross' },
  { id: 'J8', a: 'legL', b: 'diagB', at: [-LEG_U, DIAG_HI], correct: 'cross' },
  { id: 'J9', a: 'diagA', b: 'diagB', at: [0, diagCentreV], correct: 'cross' },
];

// Leg-to-stake lashings, two per leg (מקבילות), tied after the raise.
export const STAKE_JOINTS = [
  { id: 'S1', leg: 'legL', v: K.stakeJointHeights[0], correct: 'parallel' },
  { id: 'S2', leg: 'legL', v: K.stakeJointHeights[1], correct: 'parallel' },
  { id: 'S3', leg: 'legR', v: K.stakeJointHeights[0], correct: 'parallel' },
  { id: 'S4', leg: 'legR', v: K.stakeJointHeights[1], correct: 'parallel' },
];

export const LEG_STAKES = [
  { id: 'BL', leg: 'legL', u: -LEG_U - 0.09 },
  { id: 'BR', leg: 'legR', u:  LEG_U + 0.09 },
];

// Guy lines (יתרים) from the top of each leg to anchor stakes about one
// klaf-height away (45°). The klaf lies on the +z side before the raise;
// pullers stand on the −z side.
export const GUYS = [
  { id: 'G1', leg: 'legR', side: -1, he: 'יתר קדמי שמאלי' },
  { id: 'G2', leg: 'legL', side: -1, he: 'יתר קדמי ימני' },
  { id: 'G3', leg: 'legR', side: 1,  he: 'יתר אחורי שמאלי' },
  { id: 'G4', leg: 'legL', side: 1,  he: 'יתר אחורי ימני' },
];
export const GUY_DIST = K.guyDistance;

export const LEVEL = {
  name: 'קלף 2×2',
  number: 1,
  tutorial: true,   // lashing guidance shows only in the first structure's tutorial
  legU: LEG_U,
  height: K.legLength,
  targetTimeSec: 6 * 60,
  threeStarScore: 90,
  poleRadius: 0.045,
  kgPerMetre: 4,  // 8 cm pole: π·4²·0.8·100/1000 ≈ 4 kg per metre
};

// ---------- swapping the plan (free build) ----------
// Everything reads the klaf's plan from SLOTS / JOINTS / LEG_STAKES above. Free
// build puts the player's own klaf into the same arrays (in place, so every
// module sees it), and the standard plan comes back when a level is played.
const STD = { slots: [...SLOTS], joints: [...JOINTS], stakeU: LEG_STAKES.map(s => s.u), height: LEVEL.height };
export function setPlan(slots, joints) {
  SLOTS.length = 0; SLOTS.push(...slots);
  JOINTS.length = 0; JOINTS.push(...joints);
  for (const st of LEG_STAKES) {
    const leg = slots.find(s => s.id === st.leg);
    if (leg) st.u = leg.centre[0] + Math.sign(leg.centre[0] || (st.leg === 'legR' ? 1 : -1)) * 0.09;
  }
  const legs = slots.filter(s => s.id.startsWith('leg'));
  if (legs.length) LEVEL.height = Math.max(...legs.map(s => s.centre[1] + s.length / 2));
}
export function resetPlan() {
  SLOTS.length = 0; SLOTS.push(...STD.slots);
  JOINTS.length = 0; JOINTS.push(...STD.joints);
  LEG_STAKES.forEach((s, i) => { s.u = STD.stakeU[i]; });
  LEVEL.height = STD.height;
}
