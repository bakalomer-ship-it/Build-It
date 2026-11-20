// The carousel (קרוסלה מחנאית), station 4: a 5×5×5 cube with a turning seat.
//
// Omer's plan (2026-11-18): every face except the gate has a horizontal at 2.5 m
// with an X above and an X below it. The gate is the front klaf: the X above the
// 2.5 m horizontal, and below it a post from the middle of that horizontal down,
// splitting the lower half. The right half is the door (no bottom pole), the left
// half has an X. The roof is one X from corner to corner. A mast hangs from the
// roof X's centre on a rope ring, and the seat hangs from the mast, 0.5 m above
// the ground: an octagon of eight poles with a # of four poles inside it, the
// mast passing through the #'s middle square.
//
// The two klafim use the klaf plan format of level1.js (u across, v up, +u on the
// left as the pullers see it). The sides and the roof use the cube's format
// (levels.js), and the seat lies in world coordinates around the cube's centre.
import { SIZES } from './blueprints.js';
import { LEVEL } from './level1.js';
import { World } from './physics.js';
import { fitAllowance } from './allowance.js';

export const CAR = SIZES.carousel;
const r = LEVEL.poleRadius;
const U = CAR.width / 2, D = CAR.width;
const dir2 = (a, b) => { const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]); return [d[0] / l, d[1] / l]; };
const mid2 = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// ---------------- the two klafim ----------------
// an X between two uprights at u0 and u1, from height lo to hi: [diag from (u0,lo) up to (u1,hi), diag from (u1,lo) up to (u0,hi)]
function xSlots(ids, he, u0, u1, [lo, hi], length) {
  const a0 = [u0, lo], a1 = [u1, hi], b0 = [u1, lo], b1 = [u0, hi];
  return [
    { id: ids[0], he: `${he}, אלכסון ראשון`, centre: mid2(a0, a1), dir: dir2(a0, a1), length, layer: -1 },
    { id: ids[1], he: `${he}, אלכסון שני`, centre: mid2(b0, b1), dir: dir2(b0, b1), length, layer: -1 },
  ];
}
function xJoints(n, ids, up0, up1, u0, u1, [lo, hi]) {
  const c = mid2([u0, lo], [u1, hi]);
  return [
    { id: `J${n}a`, a: up0, b: ids[0], at: [u0, lo], correct: 'cross' },
    { id: `J${n}b`, a: up1, b: ids[0], at: [u1, hi], correct: 'cross' },
    { id: `J${n}c`, a: up1, b: ids[1], at: [u1, lo], correct: 'cross' },
    { id: `J${n}d`, a: up0, b: ids[1], at: [u0, hi], correct: 'cross' },
    { id: `J${n}e`, a: ids[0], b: ids[1], at: c, correct: 'cross' },
  ];
}
function klafPlan(gate) {
  const L = CAR.legLength, H = CAR.horizontalLength;
  const slots = [
    { id: 'legR', he: 'רגל שמאל', centre: [U, L / 2], dir: [0, 1], length: L, layer: 0 },
    { id: 'legL', he: 'רגל ימין', centre: [-U, L / 2], dir: [0, 1], length: L, layer: 0 },
    gate
      // under the left half only (+u is the left, seen from the front): the right half is the door
      ? { id: 'botH', he: 'רוחב תחתון, מתחת לחצי השמאלי', centre: [U / 2, CAR.bottomHeight], dir: [1, 0], length: CAR.gateBottomLength, layer: 1 }
      : { id: 'botH', he: 'רוחב תחתון', centre: [0, CAR.bottomHeight], dir: [1, 0], length: H, layer: 1 },
    { id: 'midH', he: 'רוחב אמצעי, 2.5 מ׳', centre: [0, CAR.midHeight], dir: [1, 0], length: H, layer: 1 },
    { id: 'topH', he: 'רוחב עליון', centre: [0, CAR.topHeight], dir: [1, 0], length: H, layer: 1 },
    ...xSlots(['diagC', 'diagD'], 'איקס עליון', -U, U, CAR.highX, CAR.diagLength),
  ];
  const sq = (id, a, b, at) => ({ id, a, b, at, correct: 'square' });
  const joints = [
    sq('J1', 'legL', 'midH', [-U, CAR.midHeight]), sq('J2', 'legR', 'midH', [U, CAR.midHeight]),
    sq('J3', 'legL', 'topH', [-U, CAR.topHeight]), sq('J4', 'legR', 'topH', [U, CAR.topHeight]),
    sq('J5', 'legR', 'botH', [U, CAR.bottomHeight]),
    ...xJoints('U', ['diagC', 'diagD'], 'legL', 'legR', -U, U, CAR.highX),
  ];
  if (gate) {
    slots.push({ id: 'post', he: 'עמוד הדלת', centre: [0, 0.05 + CAR.postLength / 2], dir: [0, 1], length: CAR.postLength, layer: 0 });
    slots.push(...xSlots(['diagA', 'diagB'], 'איקס תחתון שמאלי', 0, U, CAR.lowX, CAR.gateDiagLength));
    joints.push(sq('J6', 'post', 'botH', [0, CAR.bottomHeight]), sq('J7', 'post', 'midH', [0, CAR.midHeight]));
    joints.push(...xJoints('L', ['diagA', 'diagB'], 'post', 'legR', 0, U, CAR.lowX));
  } else {
    slots.push(...xSlots(['diagA', 'diagB'], 'איקס תחתון', -U, U, CAR.lowX, CAR.diagLength));
    joints.push(sq('J6', 'legL', 'botH', [-U, CAR.bottomHeight]));
    joints.push(...xJoints('L', ['diagA', 'diagB'], 'legL', 'legR', -U, U, CAR.lowX));
  }
  return { slots, joints, gate };
}
export const GATE_PLAN = klafPlan(true);
export const BACK_PLAN = klafPlan(false);
// מרחק כפיתה; the legs also carry the side lashings at the cube's heights
for (const P of [GATE_PLAN, BACK_PLAN]) fitAllowance(P.slots, P.joints, ['legR', 'legL'].flatMap(id => [CAR.sideTop, CAR.sideHighX[1]].map(v => [id, [P.slots.find(q => q.id === id).centre[0], v]])));
// the Xs in each klaf, for the explanations
export const KLAF_XS = { gate: [['diagC', 'diagD', 'האיקס העליון'], ['diagA', 'diagB', 'האיקס בחצי השמאלי התחתון']], back: [['diagC', 'diagD', 'האיקס העליון'], ['diagA', 'diagB', 'האיקס התחתון']] };

// ---------------- the sides and the roof ----------------
// side +1 is the face at x = +2.5 (the left side, seen from the front); each klaf's leg there is legR
function sideSlots(side) {
  const x = side * U, S = side > 0 ? 'L' : 'R', name = side > 0 ? 'צד שמאל' : 'צד ימין';
  const h = (id, he, v) => ({ id: `C.${id}${S}`, he: `${he} (${name})`, side, bay: 0, kind: 'h', layer: 1,
    centre: [x, r + v, D / 2], dir: [0, 0, 1], length: CAR.horizontalLength });
  const d = (id, he, v0, v1, xg) => {
    const a = [x, r + v0, 0], b = [x, r + v1, D], L = Math.hypot(b[1] - a[1], b[2] - a[2]);
    return { id: `C.${id}${S}`, he: `${he} (${name})`, side, bay: 0, kind: 'd', layer: -1, xg: xg + S,
      centre: [x, (a[1] + b[1]) / 2, D / 2], dir: [0, (b[1] - a[1]) / L, (b[2] - a[2]) / L], length: CAR.sideDiagLength };
  };
  const [l0, l1] = CAR.sideLowX, [h0, h1] = CAR.sideHighX;
  return [
    h('bot', 'חיבור תחתון', CAR.sideBottom), h('mid', 'חיבור אמצעי, 2.5 מ׳', CAR.sideMid), h('top', 'חיבור עליון', CAR.sideTop),
    d('dA', 'איקס תחתון, מלמטה קדימה', l0, l1, 'lo'), d('dB', 'איקס תחתון, מלמטה מאחור', l1, l0, 'lo'),
    d('uA', 'איקס עליון, מלמטה קדימה', h0, h1, 'hi'), d('uB', 'איקס עליון, מלמטה מאחור', h1, h0, 'hi'),
  ];
}
function sideJoints(side) {
  const S = side > 0 ? 'L' : 'R', leg = side > 0 ? 'legR' : 'legL';
  const j = (id, slot, k, v, correct) => ({ id: `C.${id}${S}`, a: `C.${slot}${S}`, klaf: k, leg, v, correct, side, bay: 0, at: [side * U, r + v, k * D] });
  const [l0, l1] = CAR.sideLowX, [h0, h1] = CAR.sideHighX;
  const centre = (id, a, b, v0, v1) => ({ id: `C.${id}${S}`, a: `C.${a}${S}`, b: `C.${b}${S}`, correct: 'cross', side, bay: 0, at: [side * U, r + (v0 + v1) / 2, D / 2] });
  return [
    j('j1', 'bot', 0, CAR.sideBottom, 'square'), j('j2', 'bot', 1, CAR.sideBottom, 'square'),
    j('j3', 'mid', 0, CAR.sideMid, 'square'), j('j4', 'mid', 1, CAR.sideMid, 'square'),
    j('j5', 'top', 0, CAR.sideTop, 'square'), j('j6', 'top', 1, CAR.sideTop, 'square'),
    j('l1', 'dA', 0, l0, 'cross'), j('l2', 'dA', 1, l1, 'cross'), j('l3', 'dB', 0, l1, 'cross'), j('l4', 'dB', 1, l0, 'cross'), centre('l5', 'dA', 'dB', l0, l1),
    j('h1', 'uA', 0, h0, 'cross'), j('h2', 'uA', 1, h1, 'cross'), j('h3', 'uB', 0, h1, 'cross'), j('h4', 'uB', 1, h0, 'cross'), centre('h5', 'uA', 'uB', h0, h1),
  ];
}
// the roof X: two diagonals resting on the two top side poles, corner to corner
const ROOF_INSET = 0.15;
function roofX() {
  const y = r + CAR.sideTop;
  const ends = [[[-U, ROOF_INSET, 'C.topR'], [U, D - ROOF_INSET, 'C.topL']], [[U, ROOF_INSET, 'C.topL'], [-U, D - ROOF_INSET, 'C.topR']]];
  const slots = [], joints = [];
  ends.forEach(([[x0, z0, s0], [x1, z1, s1]], i) => {
    const a = [x0, y, z0], b = [x1, y, z1], d = [b[0] - a[0], 0, b[2] - a[2]], L = Math.hypot(d[0], d[2]);
    const id = `C.x${'AB'[i]}T`;
    slots.push({ id, he: `איקס הגג, ${i ? 'מימין לשמאל' : 'משמאל לימין'}`, side: 0, bay: 0, kind: 'd', layer: 2 + i, xg: 'roof',
      centre: [(a[0] + b[0]) / 2, y, (a[2] + b[2]) / 2], dir: d.map(v => v / L), length: CAR.topDiagLength });
    joints.push({ id: `C.t${2 * i + 1}T`, a: id, b: s0, correct: 'cross', side: 0, bay: 0, at: a, carry: true },
      { id: `C.t${2 * i + 2}T`, a: id, b: s1, correct: 'cross', side: 0, bay: 0, at: b, carry: true });
  });
  joints.push({ id: 'C.t5T', a: slots[0].id, b: slots[1].id, correct: 'cross', side: 0, bay: 0, at: slots[0].centre, carry: true });
  return { slots, joints };
}
function makeJoin() {
  const slots = [], joints = [];
  for (const side of [-1, 1]) { slots.push(...sideSlots(side)); joints.push(...sideJoints(side)); }
  const roof = roofX(); slots.push(...roof.slots); joints.push(...roof.joints);
  // every X the plan calls for, with where it is (for the explanations)
  const xs = [];
  for (const [side, S, nm] of [[-1, 'R', 'בצד הימני'], [1, 'L', 'בצד השמאלי']]) {
    xs.push({ ids: [`C.dA${S}`, `C.dB${S}`], where: `התחתון ${nm}`, side });
    xs.push({ ids: [`C.uA${S}`, `C.uB${S}`], where: `העליון ${nm}`, side });
  }
  xs.push({ ids: ['C.xAT', 'C.xBT'], where: 'בגג', side: 0 });
  return { depth: D, bays: 1, span: D, slots, joints, xs, height: CAR.legLength, legX: U, carousel: true,
    // the side drawings show these heights and names
    sheetTitle: 'שרטוט מבט על · הגג, בגובה 5 מ׳', topSheetGap: 4.3 };
}
export const JOIN = makeJoin();
fitAllowance(JOIN.slots, JOIN.joints);
export const CAR_LEG_V = [CAR.sideBottom, CAR.sideMid, CAR.sideTop, ...CAR.sideLowX, ...CAR.sideHighX];
// the point under the roof X's centre, where the mast hangs
export const PIVOT = [0, r + CAR.sideTop + 2 * r, D / 2];

// ---------------- the seat ----------------
// It is built lying on the ground in the middle of the cube, on its own drawing,
// then lifted to its height and hung from the mast.
const ST = CAR.seat;
export const SEAT_C = [0, D / 2];
const RF = ST.radius * Math.cos(Math.PI / 8); // centre to the middle of each side
export const cornerAt = k => { const a = (22.5 + 45 * k) * Math.PI / 180; return [SEAT_C[0] + ST.radius * Math.cos(a), SEAT_C[1] + ST.radius * Math.sin(a)]; };
function seatPlan() {
  const slots = [], joints = [];
  const pole = (id, he, a, b, length, layer, extra = {}) => {
    const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]);
    slots.push({ id, he, seat: true, kind: 'h', layer, centre: [(a[0] + b[0]) / 2, r, (a[1] + b[1]) / 2], dir: [d[0] / L, 0, d[1] / L], length, ...extra });
  };
  // octagon: pole k runs from corner k to corner k+1
  for (let k = 0; k < 8; k++) pole(`S.o${k + 1}`, `צלע המתומן ${k + 1}`, cornerAt(k), cornerAt(k + 1), ST.sideLength, k % 2, { oct: k });
  const g = ST.plusGap, c = SEAT_C, h = ST.plusLength / 2;
  // the #: a pair along z (lengthwise) under a pair along x (crosswise)
  pole('S.pL1', 'סנדת אורך ימנית', [c[0] - g, c[1] - h], [c[0] - g, c[1] + h], ST.plusLength, 2, { plus: 'z' });
  pole('S.pL2', 'סנדת אורך שמאלית', [c[0] + g, c[1] - h], [c[0] + g, c[1] + h], ST.plusLength, 2, { plus: 'z' });
  pole('S.pW1', 'סנדת רוחב קדמית', [c[0] - h, c[1] - g], [c[0] + h, c[1] - g], ST.plusLength, 3, { plus: 'x' });
  pole('S.pW2', 'סנדת רוחב אחורית', [c[0] - h, c[1] + g], [c[0] + h, c[1] + g], ST.plusLength, 3, { plus: 'x' });
  const at = (x, z) => [x, r, z];
  // the corners: pole k's start on pole k−1's end
  for (let k = 0; k < 8; k++) { const p = cornerAt(k); joints.push({ id: `S.c${k + 1}`, a: `S.o${k + 1}`, b: `S.o${((k + 7) % 8) + 1}`, at: at(p[0], p[1]), correct: 'cross', corner: k }); }
  // the # on the octagon: the lengthwise pair crosses sides 2 (front, −z) and 6 (back)... sides facing ±z
  // side k faces the angle 45(k+1)°: +z is side 2 (k = 1), −z side 6 (k = 5), +x side 8 (k = 7), −x side 4 (k = 3)
  let n = 0;
  for (const id of ['S.pL1', 'S.pL2']) { const x = id.endsWith('1') ? c[0] - g : c[0] + g; joints.push({ id: `S.x${++n}`, a: id, b: 'S.o2', at: at(x, c[1] + RF), correct: 'square' }, { id: `S.x${++n}`, a: id, b: 'S.o6', at: at(x, c[1] - RF), correct: 'square' }); }
  for (const id of ['S.pW1', 'S.pW2']) { const z = id.endsWith('1') ? c[1] - g : c[1] + g; joints.push({ id: `S.x${++n}`, a: id, b: 'S.o8', at: at(c[0] + RF, z), correct: 'square' }, { id: `S.x${++n}`, a: id, b: 'S.o4', at: at(c[0] - RF, z), correct: 'square' }); }
  // the # itself: four crossings round the mast's square
  n = 0;
  for (const a of ['S.pW1', 'S.pW2']) for (const b of ['S.pL1', 'S.pL2']) {
    const x = b.endsWith('1') ? c[0] - g : c[0] + g, z = a.endsWith('1') ? c[1] - g : c[1] + g;
    joints.push({ id: `S.m${++n}`, a, b, at: at(x, z), correct: 'square' });
  }
  return { slots, joints };
}
export const SEAT = seatPlan();
fitAllowance(SEAT.slots, SEAT.joints);
// the mast, standing through the #'s middle square, and its two lashings to the lengthwise pair
export const MAST = { id: 'S.mast', he: 'התורן', length: ST.mastLength };
export const MAST_JOINTS = [
  { id: 'S.k1', b: 'S.pL1', he: 'התורן × סנדת אורך ימנית', correct: 'square' },
  { id: 'S.k2', b: 'S.pL2', he: 'התורן × סנדת אורך שמאלית', correct: 'square' },
];
// the eight hanging ropes, from the mast to each corner, and the rope ring the mast hangs on
export const HANG_ROPES = [...Array(8).keys()].map(k => ({ id: `S.r${k + 1}`, corner: k }));
export const seatY = () => r + ST.height;
// can the mast hang from the roof? its top must reach above the ring
export const mastReaches = len => ST.mastFoot + len >= PIVOT[1] + 0.1;
export const mastTopY = len => ST.mastFoot + len;

// ---------------- the carousel's physics ----------------
export const CAR_TUNING = {
  rider: 330,          // N each scout riding (about 34 kg)
  spinOmega: 1.3,      // rad/s the scouts push it to (about one turn in 5 s)
  spinPush: 140,       // N each of two scouts pushes it round with
  sidePush: 260,       // N the מדריך pushes the seat sideways with
  frameShare: 0.35,    // share of the carousel's weight the frame model carries at the roof X (tuned by feel)
  jointGive: 1e-3, // how much a seat lashing lets its two poles turn (compliance)
  sagLimit: 0.09,      // m a corner or side may bend below the rest of the seat before it counts as broken
  swingLimit: 0.1,     // m the seat may swing off the mast: the # leaves only a few cm round it
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const rigidAll = (W, ids) => { for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) W.add('rigid', ids[a], ids[b], { tag: 'pole' }); };

// The seat and the mast in a world of their own. The mast hangs on its ring from a
// point that follows the frame's roof X (setPivot); its weight goes back to the
// frame as a load (pivotLoad).
export class CarouselSim {
  // seat: { poles, joints }; hang: { mast: {length} | null, pivot, joints: {S.k1...}, ropes: {S.r1...} }
  constructor(seat, hang) {
    const W = this.world = new World();
    W.iterations = 4; W.damping = 0.25;
    const y0 = seatY();
    this.seat = seat; this.hang = hang;
    this.poles = {};
    const mass = LEVEL.kgPerMetre;
    for (const s of SEAT.slots) {
      const p = seat.poles[s.id]; if (!p) continue;
      const half = p.length / 2, ss = new Set([-half, half, 0]);
      for (const j of SEAT.joints) if (j.a === s.id || j.b === s.id) { const t = (j.at[0] - s.centre[0]) * s.dir[0] + (j.at[2] - s.centre[2]) * s.dir[2]; if (Math.abs(t) <= half - 0.03) ss.add(Math.round(t * 1000) / 1000); }
      if (s.plus === 'z') ss.add(0);
      const list = [...ss].sort((a, b) => a - b);
      this.poles[s.id] = list.map(t => ({ t, id: W.addParticle([s.centre[0] + s.dir[0] * t, y0, s.centre[2] + s.dir[2] * t], p.length * mass / list.length, r) }));
      rigidAll(W, this.poles[s.id].map(q => q.id));
    }
    this.cons = {};
    for (const j of SEAT.joints) {
      if (!seat.joints[j.id]) continue;
      const a = this.near(j.a, j.at), b = this.near(j.b, j.at);
      if (a == null || b == null) continue;
      this.cons[j.id] = W.add('weld', a, b, { tag: j.id });
      // a tight lashing also holds the angle between the two poles, so the seat does not fold at its joints
      for (const na of this.nextTo(j.a, a)) for (const nb of this.nextTo(j.b, b)) W.add('rigid', na, nb, { tag: j.id, compliance: CAR_TUNING.jointGive });
    }
    // the mast
    this.mast = null;
    if (hang.mast) {
      const foot = CAR.seat.mastFoot, top = foot + hang.mast.length;
      const hy = Math.min(PIVOT[1] - 0.1, top - 0.05);
      const pts = [foot, y0, y0 + 0.35, CAR.seat.ropeHeight, hy, top].filter((v, i, a) => v <= top && a.indexOf(v) === i).sort((a, b) => a - b);
      const ids = pts.map(y => W.addParticle([SEAT_C[0], y, SEAT_C[1]], hang.mast.length * mass / pts.length, r));
      rigidAll(W, ids);
      const at = y => ids[pts.indexOf(y)];
      this.mast = { ids, foot: ids[0], top: ids[ids.length - 1], seat: at(y0), knee: at(y0 + 0.35), rope: at(CAR.seat.ropeHeight), hang: at(hy) };
      this.pivot = W.addParticle([...PIVOT], 0);
      this.ring = hang.pivot && mastReaches(hang.mast.length) ? W.add('rope', this.mast.hang, this.pivot, { rest: Math.max(0.05, PIVOT[1] - hy) }) : null;
      // the mast lashed to the lengthwise pair of the #
      for (const mj of MAST_JOINTS) {
        if (!hang.joints[mj.id]) continue;
        const q = this.poles[mj.b]?.find(v => Math.abs(v.t) < 1e-6)?.id; if (q == null) continue;
        W.add('rigid', q, this.mast.seat, { tag: mj.id }); W.add('rigid', q, this.mast.knee, { tag: mj.id });
      }
      // the hanging ropes, from the mast to each corner (tied on the pole that starts there)
      this.ropes = {};
      for (const hr of HANG_ROPES) {
        if (!hang.ropes[hr.id]) continue;
        const c = cornerAt(hr.corner), q = this.near(`S.o${hr.corner + 1}`, [c[0], 0, c[1]]) ?? this.near(`S.o${((hr.corner + 7) % 8) + 1}`, [c[0], 0, c[1]]);
        if (q != null) this.ropes[hr.id] = W.add('rope', this.mast.rope, q, { tag: hr.id });
      }
    }
    this.y0 = y0;
    this.spin = 0; this.angle = 0; this.lastA = this.seatAngle();
  }
  // the particle of pole sid nearest a point (only its x and z count)
  near(sid, p) {
    const P = this.poles[sid]; if (!P) return null;
    let best = null, bd = 0.06;
    for (const q of P) { const x = this.world.p[q.id].x, d = Math.hypot(x[0] - p[0], x[2] - p[2]); if (d < bd) { bd = d; best = q.id; } }
    return best;
  }
  // the particles beside one on its pole
  nextTo(sid, id) { const P = this.poles[sid], i = P.findIndex(q => q.id === id); return [P[i - 1], P[i + 1]].filter(Boolean).map(q => q.id); }
  pos(id) { return this.world.p[id].x; }
  setPivot(p) {
    if (this.pivot == null) return;
    const q = this.world.p[this.pivot];
    if (!this.pivotSet) {
      // the first time: the whole carousel hangs where the real roof is, without a jolt
      this.pivotSet = true;
      const d = sub(p, q.x);
      for (const v of this.world.p) { v.x = v.x.map((x, i) => x + d[i]); v.prev = v.prev.map((x, i) => x + d[i]); }
      this.y0 += d[1];
    }
    q.x = [...p]; q.prev = [...p];
  }
  // the seat's turn, from the first octagon pole's direction
  seatAngle() {
    const P = this.poles['S.o1'] || this.poles['S.o5']; if (!P) return 0;
    const a = this.pos(P[0].id), b = this.pos(P[P.length - 1].id);
    return Math.atan2(b[2] - a[2], b[0] - a[0]);
  }
  // where the riders sit: the middle of each octagon side
  riderSpots() {
    return [...Array(8).keys()].map(k => { const P = this.poles[`S.o${k + 1}`]; const q = P?.find(v => Math.abs(v.t) < 1e-6); return q ? q.id : null; });
  }
  // how far the seat has bent: a corner or side lower than its neighbours round the
  // octagon. The whole carousel swinging or tilting a little is not a bend; dropping far is.
  sag() {
    let axis = [0, 1, 0], o = [0, 0, 0];
    if (this.mast) { const a = this.pos(this.mast.foot), b = this.pos(this.mast.top), d = sub(b, a), l = Math.hypot(...d); axis = d.map(v => v / l); o = this.pos(this.mast.seat); }
    const h = id => { const x = this.pos(id); return (x[0] - o[0]) * axis[0] + (x[1] - o[1]) * axis[1] + (x[2] - o[2]) * axis[2]; };
    // round the octagon: each corner (the lower of the two pole ends there), then the middle of the side
    const ring = [];
    let low = Infinity;
    for (let k = 0; k < 8; k++) {
      const P = this.poles[`S.o${k + 1}`], Q = this.poles[`S.o${((k + 7) % 8) + 1}`];
      const ends = [P?.[0], Q?.[Q.length - 1]].filter(Boolean).map(q => h(q.id));
      ring.push(ends.length ? Math.min(...ends) : null);
      const mid = P?.find(v => Math.abs(v.t) < 1e-6); ring.push(mid ? h(mid.id) : null);
      for (const q of P || []) low = Math.min(low, this.pos(q.id)[1]);
    }
    let bend = 0;
    for (let i = 0; i < 16; i++) {
      const a = ring[(i + 15) % 16], c = ring[i], b = ring[(i + 1) % 16];
      if (a != null && b != null && c != null) bend = Math.max(bend, (a + b) / 2 - c);
    }
    return low === Infinity ? 0 : Math.max(bend, this.y0 - low - 0.3);
  }
  // the seat's centre off the mast, sideways
  swing() {
    if (!this.mast) return 0;
    const ids = Object.keys(this.poles).filter(s => s.startsWith('S.o')).flatMap(s => this.poles[s].map(q => q.id));
    if (!ids.length) return 0;
    const c = [0, 0, 0]; for (const id of ids) { const x = this.pos(id); c[0] += x[0] / ids.length; c[2] += x[2] / ids.length; }
    const m = this.pos(this.mast.seat);
    return Math.hypot(c[0] - m[0], c[2] - m[2]);
  }
  mastTilt() {
    if (!this.mast) return 0;
    const a = this.pos(this.mast.foot), b = this.pos(this.mast.top), d = sub(b, a);
    return Math.acos(Math.min(1, d[1] / Math.hypot(...d))) * 180 / Math.PI;
  }
  // how much the ring pulls down on the roof
  pivotLoad() { return this.ring ? this.ring.force : 0; }
  step(dt, { riders = 0, spin = false, side = null } = {}) {
    const W = this.world, spots = this.riderSpots();
    // riders get on in opposite pairs so it stays level
    const order = [0, 4, 2, 6, 1, 5, 3, 7];
    for (let n = 0; n < Math.min(8, Math.floor(riders / 2) * 2); n++) { const id = spots[order[n]]; if (id != null) W.applyForce(id, [0, -CAR_TUNING.rider, 0]); }
    if (spin && this.mast) {
      // two scouts on opposite sides push it round, until it turns fast enough
      for (const k of [0, 4]) {
        const id = spots[k]; if (id == null) continue;
        const p = this.pos(id), m = this.pos(this.mast.seat), d = [p[0] - m[0], 0, p[2] - m[2]], l = Math.hypot(d[0], d[2]) || 1;
        const f = this.spin < CAR_TUNING.spinOmega ? CAR_TUNING.spinPush : 0;
        W.applyForce(id, [-d[2] / l * f, 0, d[0] / l * f]);
      }
    }
    if (side) {
      // the מדריך pushes the seat sideways at its middle (the #)
      const ids = ['S.pL1', 'S.pL2', 'S.pW1', 'S.pW2'].map(sid => this.poles[sid]?.find(v => Math.abs(v.t) < 0.2)?.id).filter(id => id != null);
      for (const id of ids) W.applyForce(id, side.map(v => v / ids.length));
    }
    W.step(Math.min(dt, 1 / 30), 20);
    const a = this.seatAngle();
    let da = a - this.lastA; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    this.lastA = a; this.angle += da;
    this.spin = this.spin * 0.9 + (da / Math.max(1e-4, Math.min(dt, 1 / 30))) * 0.1;
  }
}
