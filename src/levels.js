// The levels. Each level is one or more klafim (all built from the klaf 2×2
// plan in level1.js) plus, for the cube, the side poles that join them.
// Sizes come from blueprints.js.
import { SIZES } from './blueprints.js';
import { fitAllowance } from './allowance.js';
import { LEVEL as KLAF } from './level1.js';
import { GATE_PLAN, BACK_PLAN, JOIN, CAR, CAR_LEG_V, CUBE4 } from './carousel.js';
import { TRI90, WH } from './wheel.js';

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
    return { id: `C.${id}${S}`, he: `${he} (${name})`, side, bay, kind: 'd', layer: -1, // like the klaf's own X: on the inside of the legs, touching them
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
// ---- flat Xs at the 2 m level (Omer, 2026-11-15) ----
// Every cube also has an איקס מרחבי lying flat in its top face, and where two
// cubes meet there is one more at the 2 m level, across the shared klaf.
// A flat X is two diagonals resting on the top side poles (side 0 = the top),
// each lashed to a top side pole at both ends, and to each other at the centre.
const TOP_INSET = 0.12;       // how far in from the klaf the top X's ends sit
const LINK_REACH = 0.7;       // the connection X reaches this far into each cube
function flatX(tag, name, bay, ends, length) {
  // ends: for each diagonal, [slot id, z] at its two ends on the top side poles
  const pt = (sid, z) => { const sp = sid.endsWith('2') ? BAY_DV : 0; return [(sid.includes('topL') ? 1 : -1) * LEG_X, r + C.sideTopHeight + sp, z]; };
  const slots = [], joints = [];
  ends.forEach(([[s1, z1], [s2, z2]], i) => {
    const a = pt(s1, z1), b = pt(s2, z2), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
    const id = `C.x${'AB'[i]}${tag}`;
    slots.push({ id, he: `איקס מרחבי עליון, ${i ? 'מימין לשמאל' : 'משמאל לימין'} (${name})`, side: 0, bay, kind: 'd', layer: 2 + i,
      centre: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], dir: d.map(v => v / L), length });
    joints.push({ id: `C.t${2 * i + 1}${tag}`, a: id, b: s1, correct: 'cross', side: 0, bay, at: a },
      { id: `C.t${2 * i + 2}${tag}`, a: id, b: s2, correct: 'cross', side: 0, bay, at: b });
  });
  const [A, B] = slots;
  joints.push({ id: `C.t5${tag}`, a: A.id, b: B.id, correct: 'cross', side: 0, bay, at: A.centre });
  return { slots, joints };
}
function topX(bay, n) {
  const S = bay ? String(bay + 1) : '', z0 = bay * D;
  return flatX('T' + S, 'מבט על' + bayName(bay, n), bay, [
    [[`C.topR${S}`, z0 + TOP_INSET], [`C.topL${S}`, z0 + D - TOP_INSET]],
    [[`C.topL${S}`, z0 + TOP_INSET], [`C.topR${S}`, z0 + D - TOP_INSET]],
  ], C.topDiagLength);
}
// the connection X between cube `bay` and cube `bay+1`, across the klaf they share
function linkX(bay) {
  const S0 = bay ? String(bay + 1) : '', S1 = String(bay + 2), z = (bay + 1) * D;
  return flatX('K' + (bay ? bay + 1 : ''), 'מבט על, בחיבור בין הקוביות', bay + 0.5, [
    [[`C.topR${S0}`, z - LINK_REACH], [`C.topL${S1}`, z + LINK_REACH]],
    [[`C.topL${S0}`, z - LINK_REACH], [`C.topR${S1}`, z + LINK_REACH]],
  ], C.linkDiagLength);
}
function makeCube(bays) {
  const slots = [], joints = [];
  const add = x => { slots.push(...x.slots); joints.push(...x.joints); };
  for (let b = 0; b < bays; b++) {
    for (const side of [-1, 1]) { slots.push(...sideSlots(side, b, bays)); joints.push(...sideJoints(side, b)); }
    add(topX(b, bays));
    if (b < bays - 1) add(linkX(b));
  }
  fitAllowance(slots, joints); // מרחק כפיתה
  return { depth: D, bays, span: bays * D, slots, joints };
}
// heights on each leg where a side pole is lashed (the legs need a point there)
const legV = bays => [C.sideBottomHeight, C.sideTopHeight, C.sideDiagLow, C.sideDiagHigh].flatMap(v => [...Array(bays).keys()].map(b => v + b * BAY_DV));
const CUBE_LEG_V = legV(1), BASE_LEG_V = legV(2);
// every guy line, front or back, reaches a stake one klaf-height out at 45° (Omer, 11-20)

export const LEVELS = [
  {
    number: 1, name: 'קלף 2×2', tutorial: true, targetTimeSec: 6 * 60,
    // the pile: the plan's poles plus these extra lengths; the crew for the raise
    stockExtra: [3.0, 2.6, 2.0, 1.6, 1.2], ropeSpare: 2, crew: 6, // 5 spare poles in every level (Omer 11-21); a klaf raise takes 6
    klafim: [{ ...SOLO, he: 'הקלף' }],
    cube: null,
  },
  {
    // בסיס מתקן: two cubes in a row, three klafim, the middle one shared
    number: 2, name: 'בסיס מתקן 2×4', tutorial: false, targetTimeSec: 26 * 60,
    stockExtra: [3.0, 2.6, 2.2, 1.6, 1.2], ropeSpare: 3, crew: 6,
    klafim: [
      { ...SOLO, he: 'קלף קדמי', short: 'א׳', inner: 1, extraLegV: BASE_LEG_V },
      { ...SOLO, he: 'קלף אמצעי', short: 'ב׳', z0: D, inner: 'both', extraLegV: BASE_LEG_V },
      { ...SOLO, he: 'קלף אחורי', short: 'ג׳', z0: 2 * D, inner: -1, extraLegV: BASE_LEG_V },
    ],
    cube: makeCube(2),
  },
  {
    // חצובה: three legs lashed at the top, stood up and spread (see tripod.js)
    number: 3, name: 'חצובה 4 מ׳', tutorial: false, targetTimeSec: 10 * 60, tripod: true,
    stockExtra: [5.0, 4.0, 3.0, 2.0, 1.5], ropeSpare: 2, crew: 6,
    // where it is built: the legs lie from z0 towards +z, and it stands over `centre`
    klafim: [{ ...SOLO, he: 'חצובה' }], centre: [0, 0.7],
    cube: null,
  },
  {
    // קרוסלה מחנאית on a 5×5×5 cube (Omer, 2026-11-18; see carousel.js)
    number: 4, name: 'קרוסלה 5×5', tutorial: false, targetTimeSec: 45 * 60, carousel: true, camScale: 2.1,
    stockExtra: [6.0, 4.0, 3.0, 2.0, 1.2], ropeSpare: 4, crew: 6,
    // every guy line, front or back, leaves at 45° and reaches a stake as far out as the front ones (Omer, 11-20)
    klafim: [
      { ...SOLO, he: 'קלף השער', short: 'א׳', plan: GATE_PLAN, frontDist: CAR.guyDistance, backDist: CAR.guyDistance, pullDist: CAR.guyDistance + 1.4,
        anchorX: { front: 1.05, back: 1.05 }, inner: 1, extraLegV: CAR_LEG_V, backGripCap: CAR.backGripCap },
      { ...SOLO, he: 'קלף אחורי', short: 'ב׳', plan: BACK_PLAN, z0: CAR.width, frontDist: CAR.guyDistance, backDist: CAR.guyDistance, pullDist: CAR.guyDistance + 1.4,
        anchorX: { front: 1.05, back: 1.05 }, inner: -1, extraLegV: CAR_LEG_V, backGripCap: CAR.backGripCap },
    ],
    cube: JOIN,
  },
  {
    // גלגל ענק: two 90° tripods, a wheel turning on the axle across their heads, one seat (Omer, 2026-11-20; see wheel.js)
    number: 5, name: 'גלגל ענק', tutorial: false, targetTimeSec: 45 * 60, wheel: true, camScale: 1.2,
    stockExtra: [4.0, 3.0, 2.5, 2.0, 1.2], ropeSpare: 4, crew: 6,
    // each tripod's legs lie from z0 towards +z, tops together; it stands with its upright
    // leg's foot at `centre` (from z0), its leaning legs out, away from the wheel (`out`)
    klafim: [
      { ...SOLO, kind: 'tripod', he: 'חצובה קדמית', short: 'א׳', tri: TRI90, plan: { slots: TRI90.slots, joints: TRI90.joints }, z0: -3.8, centre: [0, 3.8], out: -1 },
      { ...SOLO, kind: 'tripod', he: 'חצובה אחורית', short: 'ב׳', tri: TRI90, plan: { slots: TRI90.slots, joints: TRI90.joints }, z0: WH.apart, centre: [0, 0], out: 1 },
    ],
    cube: null,
  },
];
// Free build, tripod (Omer 2026-11-19): the tripod station with no drawing to
// match. Any leg and brace length from an open pile, the feet go wherever the
// player puts them, and the מדריך's inspection only says whether it stands.
export const FREE_TRIPOD = {
  ...LEVELS.find(l => l.tripod), number: 0, sandbox: true, name: 'חצובה חופשית', targetTimeSec: 0,
  stockExtra: [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0].flatMap(l => [l, l, l, l]), ropeSpare: 12,
};

// The 2×2 cube is no longer a station of its own (Omer, 2026-11-16: station 2 is the
// 2×4 base). It stays here for the physics tests.
export const CUBE_LEVEL = {
    number: 0, name: 'קובייה 2×2', tutorial: false, targetTimeSec: 16 * 60,
    stockExtra: [3.0, 2.2, 1.6], ropeSpare: 2, crew: 6, // a proper klaf raise takes 6 (Omer)
    klafim: [
      { ...SOLO, he: 'קלף קדמי', short: 'א׳', inner: 1, extraLegV: CUBE_LEG_V },
      { ...SOLO, he: 'קלף אחורי', short: 'ב׳', z0: D, inner: -1, extraLegV: CUBE_LEG_V },
    ],
    cube: makeCube(1),
  };

// The 4×4 cube (Omer, 2026-11-21): a challenge only, to show work at height. Its two
// klafim are like the carousel's back klaf at 4 m; it starts standing with every
// connection from the ground tied and some connections above 2 m missing.
const C4 = SIZES.cube4;
const C4K = { frontDist: C4.guyDistance, backDist: C4.guyDistance, pullDist: C4.guyDistance + 1.4, anchorX: { front: 1.05, back: 1.05 }, extraLegV: CUBE4.CAR_LEG_V, backGripCap: C4.backGripCap };
export const CUBE4_LEVEL = {
  number: 0, name: 'קובייה 4×4', tutorial: false, targetTimeSec: 20 * 60, frame: true, camScale: 1.75, bp: [5.6, 2.0],
  stockExtra: [4.0, 2.0], ropeSpare: 4, crew: 6,
  klafim: [
    { ...SOLO, ...C4K, he: 'קלף קדמי', short: 'א׳', plan: CUBE4.BACK_PLAN, inner: 1 },
    { ...SOLO, ...C4K, he: 'קלף אחורי', short: 'ב׳', plan: CUBE4.BACK_PLAN, z0: C4.width, inner: -1 },
  ],
  cube: CUBE4.JOIN,
};

// The carousel's frame alone, without the seat (a "find the missing connections" challenge)
export const CARFRAME_LEVEL = { ...LEVELS[3], number: 0, carousel: false, frame: true, name: 'מסגרת קרוסלה 5×5', bp: [6.8, 2.45] };
