// The levels. Each level is one or more klafim (all built from the klaf 2×2
// plan in level1.js) plus, for the cube, the side poles that join them.
// Sizes come from blueprints.js.
import { SIZES } from './blueprints.js';
import { LEVEL as KLAF } from './level1.js';

const K = SIZES.klaf, C = SIZES.cube;
const r = KLAF.poleRadius;
const D = C.depth, LEG_X = K.legSpacing / 2;

// How a klaf sits on the plaza.
//  z0:        where its legs stand (it lies on the +z side of that line before the raise)
//  frontDist: front guy-line stakes, towards −z (the pullers' lines)
//  backDist:  back guy-line stakes, towards +z
//  pullDist:  where the pullers stand, behind the front stakes
//  anchorX:   how far out to the side the guy stakes stand, as a share of the leg's x
//  inner:     which guy lines stand inside the cube (+1 back, −1 front, 0 none)
const SOLO = { z0: 0, frontDist: K.guyDistance, backDist: K.guyDistance, pullDist: K.guyDistance + 1.4, anchorX: { front: 1.05, back: 1.05 }, inner: 0 };

// ---- cube side poles (3D, world coordinates, y measured up the leg) ----
// Each slot: a straight centre line (centre, unit dir) and a planned length.
// side +1 is the face at x = +0.9 (the left side, seen from the front pullers).
// A cube level has one or more bays (2×2 cubes) in a row along z; bay b runs
// from klaf b (z = b·D) to klaf b+1. The second bay's poles sit a little higher
// on the shared legs, so its lashings don't land on top of the first bay's.
const BAY_DV = 0.08;
const bayName = (bay, n) => n > 1 ? (bay === 0 ? ', קובייה קדמית' : ', קובייה אחורית') : '';
function sideSlots(side, bay = 0, n = 1) {
  const x = side * LEG_X, S = (side > 0 ? 'L' : 'R') + (bay ? bay + 1 : ''), z0 = bay * D, dv = bay * BAY_DV;
  const name = (side > 0 ? 'צד שמאל' : 'צד ימין') + bayName(bay, n);
  const h = (id, he, v) => ({ id: `C.${id}${S}`, he: `${he} (${name})`, side, bay, kind: 'h', layer: 1,
    centre: [x, r + v + dv, z0 + D / 2], dir: [0, 0, 1], length: C.sideHorizontalLength });
  const d = (id, he, v0, v1) => {
    const a = [x, r + v0 + dv, z0], b = [x, r + v1 + dv, z0 + D];
    const L = Math.hypot(b[1] - a[1], b[2] - a[2]);
    return { id: `C.${id}${S}`, he: `${he} (${name})`, side, bay, kind: 'd', layer: id === 'dA' ? 2 : 3,
      centre: [x, (a[1] + b[1]) / 2, z0 + D / 2], dir: [0, (b[1] - a[1]) / L, (b[2] - a[2]) / L], length: C.sideDiagLength };
  };
  return [
    h('bot', 'חיבור תחתון', C.sideBottomHeight),
    h('top', 'חיבור עליון', C.sideTopHeight),
    d('dA', 'איקס מרחבי, מלמטה קדימה', C.sideDiagLow, C.sideDiagHigh),
    d('dB', 'איקס מרחבי, מלמטה מאחור', C.sideDiagHigh, C.sideDiagLow), // runs from high at the front to low at the back
  ];
}
function sideJoints(side, bay = 0) {
  const S = (side > 0 ? 'L' : 'R') + (bay ? bay + 1 : ''), leg = side > 0 ? 'legR' : 'legL', dv = bay * BAY_DV;
  // klaf bay stands at the front of the bay, klaf bay+1 at its back
  const j = (id, slot, k, v, correct) => ({ id: `C.${id}${S}`, a: `C.${slot}${S}`, klaf: bay + k, leg, v: v + dv, correct, side, bay,
    at: [side * LEG_X, r + v + dv, (bay + k) * D] });
  return [
    j('j1', 'bot', 0, C.sideBottomHeight, 'square'), j('j2', 'bot', 1, C.sideBottomHeight, 'square'),
    j('j3', 'top', 0, C.sideTopHeight, 'square'), j('j4', 'top', 1, C.sideTopHeight, 'square'),
    j('j5', 'dA', 0, C.sideDiagLow, 'cross'), j('j6', 'dA', 1, C.sideDiagHigh, 'cross'),
    j('j7', 'dB', 0, C.sideDiagHigh, 'cross'), j('j8', 'dB', 1, C.sideDiagLow, 'cross'),
    // the centre of the spatial X: the two diagonals lashed to each other
    { id: `C.j9${S}`, a: `C.dA${S}`, b: `C.dB${S}`, correct: 'cross', side, bay,
      at: [side * LEG_X, r + (C.sideDiagLow + C.sideDiagHigh) / 2 + dv, bay * D + D / 2] },
  ];
}
function makeCube(bays) {
  const slots = [], joints = [];
  for (let b = 0; b < bays; b++) for (const side of [-1, 1]) { slots.push(...sideSlots(side, b, bays)); joints.push(...sideJoints(side, b)); }
  return { depth: D, bays, span: bays * D, slots, joints };
}
// heights on each leg where a side pole is lashed (the legs need a point there)
const legV = bays => [C.sideBottomHeight, C.sideTopHeight, C.sideDiagLow, C.sideDiagHigh].flatMap(v => [...Array(bays).keys()].map(b => v + b * BAY_DV));
const CUBE_LEG_V = legV(1), BASE_LEG_V = legV(2);
const IN = C.innerGuyDistance;

export const LEVELS = [
  {
    number: 1, name: 'קלף 2×2', tutorial: true, targetTimeSec: 6 * 60,
    // the pile: the plan's poles plus these extra lengths; the crew for the raise
    stockExtra: [3.0, 1.6], ropeSpare: 2, crew: 6, // a proper klaf raise takes 6 (Omer)
    klafim: [{ ...SOLO, he: 'הקלף' }],
    cube: null,
  },
  {
    number: 2, name: 'קובייה 2×2', tutorial: false, targetTimeSec: 16 * 60,
    stockExtra: [3.0, 2.2, 1.6], ropeSpare: 2, crew: 6, // a proper klaf raise takes 6 (Omer)
    klafim: [
      { ...SOLO, he: 'קלף קדמי', short: 'א׳', backDist: IN, anchorX: { front: 1.05, back: 0.65 }, inner: 1, extraLegV: CUBE_LEG_V },
      { ...SOLO, he: 'קלף אחורי', short: 'ב׳', z0: D, frontDist: C.innerGuyDistance, pullDist: 1.3, anchorX: { front: 0.65, back: 1.05 }, inner: -1, extraLegV: CUBE_LEG_V },
    ],
    cube: makeCube(1),
  },
  {
    // בסיס מתקן: two cubes in a row, three klafim, the middle one shared
    number: 3, name: 'בסיס מתקן 2×4', tutorial: false, targetTimeSec: 26 * 60,
    stockExtra: [3.0, 2.2, 1.6], ropeSpare: 3, crew: 6,
    klafim: [
      { ...SOLO, he: 'קלף קדמי', short: 'א׳', backDist: IN, anchorX: { front: 1.05, back: 0.65 }, inner: 1, extraLegV: BASE_LEG_V },
      { ...SOLO, he: 'קלף אמצעי', short: 'ב׳', z0: D, frontDist: IN, backDist: IN, pullDist: 1.3, anchorX: { front: 0.65, back: 0.65 }, inner: 'both', extraLegV: BASE_LEG_V },
      { ...SOLO, he: 'קלף אחורי', short: 'ג׳', z0: 2 * D, frontDist: IN, pullDist: 1.3, anchorX: { front: 0.65, back: 1.05 }, inner: -1, extraLegV: BASE_LEG_V },
    ],
    cube: makeCube(2),
  },
];
