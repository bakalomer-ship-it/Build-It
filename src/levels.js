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
function sideSlots(side) {
  const x = side * LEG_X, S = side > 0 ? 'L' : 'R';
  const name = side > 0 ? 'צד שמאל' : 'צד ימין';
  const h = (id, he, v) => ({ id: `C.${id}${S}`, he: `${he} (${name})`, side, kind: 'h', layer: 1,
    centre: [x, r + v, D / 2], dir: [0, 0, 1], length: C.sideHorizontalLength });
  const d = (id, he, v0, v1) => {
    const a = [x, r + v0, 0], b = [x, r + v1, D];
    const L = Math.hypot(b[1] - a[1], b[2] - a[2]);
    return { id: `C.${id}${S}`, he: `${he} (${name})`, side, kind: 'd', layer: id === 'dA' ? 2 : 3,
      centre: [x, (a[1] + b[1]) / 2, D / 2], dir: [0, (b[1] - a[1]) / L, (b[2] - a[2]) / L], length: C.sideDiagLength };
  };
  return [
    h('bot', 'חיבור תחתון', C.sideBottomHeight),
    h('top', 'חיבור עליון', C.sideTopHeight),
    d('dA', 'איקס מרחבי, מלמטה קדימה', C.sideDiagLow, C.sideDiagHigh),
    d('dB', 'איקס מרחבי, מלמטה מאחור', C.sideDiagHigh, C.sideDiagLow), // runs from high at the front to low at the back
  ];
}
function sideJoints(side) {
  const S = side > 0 ? 'L' : 'R', leg = side > 0 ? 'legR' : 'legL';
  // klaf 0 stands at z = 0 (front), klaf 1 at z = D (back)
  const j = (id, slot, k, v, correct) => ({ id: `C.${id}${S}`, a: `C.${slot}${S}`, klaf: k, leg, v, correct, side,
    at: [side * LEG_X, r + v, k * D] });
  return [
    j('j1', 'bot', 0, C.sideBottomHeight, 'square'), j('j2', 'bot', 1, C.sideBottomHeight, 'square'),
    j('j3', 'top', 0, C.sideTopHeight, 'square'), j('j4', 'top', 1, C.sideTopHeight, 'square'),
    j('j5', 'dA', 0, C.sideDiagLow, 'cross'), j('j6', 'dA', 1, C.sideDiagHigh, 'cross'),
    j('j7', 'dB', 0, C.sideDiagHigh, 'cross'), j('j8', 'dB', 1, C.sideDiagLow, 'cross'),
    // the centre of the spatial X: the two diagonals lashed to each other
    { id: `C.j9${S}`, a: `C.dA${S}`, b: `C.dB${S}`, correct: 'cross', side,
      at: [side * LEG_X, r + (C.sideDiagLow + C.sideDiagHigh) / 2, D / 2] },
  ];
}
const CUBE_SLOTS = [...sideSlots(-1), ...sideSlots(1)];
const CUBE_JOINTS = [...sideJoints(-1), ...sideJoints(1)];
// heights on each leg where a side pole is lashed (the legs need a point there)
const CUBE_LEG_V = [C.sideBottomHeight, C.sideTopHeight, C.sideDiagLow, C.sideDiagHigh];

export const LEVELS = [
  {
    number: 1, name: 'קלף 2×2', tutorial: true, targetTimeSec: 6 * 60,
    klafim: [{ ...SOLO, he: 'הקלף' }],
    cube: null,
  },
  {
    number: 2, name: 'קובייה 2×2', tutorial: false, targetTimeSec: 16 * 60,
    klafim: [
      { ...SOLO, he: 'קלף קדמי', short: 'א׳', backDist: C.innerGuyDistance, anchorX: { front: 1.05, back: 0.65 }, inner: 1, extraLegV: CUBE_LEG_V },
      { ...SOLO, he: 'קלף אחורי', short: 'ב׳', z0: D, frontDist: C.innerGuyDistance, pullDist: 1.3, anchorX: { front: 0.65, back: 1.05 }, inner: -1, extraLegV: CUBE_LEG_V },
    ],
    cube: { depth: D, slots: CUBE_SLOTS, joints: CUBE_JOINTS },
  },
];
