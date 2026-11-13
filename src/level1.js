// Level 1: a 2x2 klaf (קלף 2×2).
// All numbers are ASSUMPTIONS from the design document until Omer's real
// blueprints arrive. Coordinates are in metres in the klaf's own plane:
// u runs across the klaf (−1 … +1), v runs up from the ground (0 … 2).
// Replace this file with real blueprint data later.

export const LASHINGS = {
  square:   { he: 'כפיתה מרובעת', short: 'מרובעת' },
  cross:    { he: 'כפיתה מוצלבת', short: 'מוצלבת' },
  parallel: { he: 'כפיתה מקבילה', short: 'מקבילה' },
  running:  { he: 'כפיתה רצה',    short: 'רצה' },
  tripod:   { he: 'כפיתת חצובה',  short: 'חצובה' },
};
export const LASHING_ORDER = ['square', 'cross', 'parallel', 'running', 'tripod'];

const LEG_U = 0.9;      // legs stand 1.8 m apart (centre to centre)
const BOTTOM_V = 0.3;   // bottom horizontal 30 cm above the ground (Omer)
const TOP_V = 1.9;
const DIAG_LO = 0.45, DIAG_HI = 1.75;
const diagCentreV = (DIAG_LO + DIAG_HI) / 2;
const diagLen = 2.6;

function dir(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy); return [dx / l, dy / l]; }

// Each slot is one pole in the drawing: a centre line and a planned length.
// layer: which face of the klaf the pole lies on (for drawing only).
export const SLOTS = [
  { id: 'legR', he: 'רגל שמאל',      centre: [ LEG_U, 1.0], dir: [0, 1], length: 2.0, layer: 0 },
  { id: 'legL', he: 'רגל ימין',      centre: [-LEG_U, 1.0], dir: [0, 1], length: 2.0, layer: 0 },
  { id: 'botH', he: 'רוחב תחתון',    centre: [0, BOTTOM_V], dir: [1, 0], length: 2.0, layer: 1 },
  { id: 'topH', he: 'רוחב עליון',    centre: [0, TOP_V],    dir: [1, 0], length: 2.0, layer: 1 },
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
  { id: 'S1', leg: 'legL', v: 0.15, correct: 'parallel' },
  { id: 'S2', leg: 'legL', v: 0.55, correct: 'parallel' },
  { id: 'S3', leg: 'legR', v: 0.15, correct: 'parallel' },
  { id: 'S4', leg: 'legR', v: 0.55, correct: 'parallel' },
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
export const GUY_DIST = 2.0;

export const LEVEL = {
  name: 'קלף 2×2',
  number: 1,
  legU: LEG_U,
  height: 2.0,
  targetTimeSec: 6 * 60,
  threeStarScore: 90,
  poleRadius: 0.045,
  kgPerMetre: 4,  // 8 cm pole: π·4²·0.8·100/1000 ≈ 4 kg per metre
};
