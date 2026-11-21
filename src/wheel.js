// The giant wheel (גלגל ענק), station 5 (Omer's photos, 2026-11-20).
//
// Omer (11-20): ONE seat; the axle turns in the forks with the wheel lashed to it;
// the towers are 90° tripods (חצובה ב־90 מעלות), their upright leg on the wheel's
// side, and the box (the wheel) rests on a pole between the tripods' tops (the axle).
//
//  - Two 90° tripods: three legs laid side by side, tops together, one כפיתת חצובה;
//    stood up by six scouts, the upright leg's foot right under the head and the two
//    leaning legs' feet out to the sides, away from the wheel; braces low between
//    the legs and a stake at each foot, as in station 3.
//  - The wheel: two square klafim stood on a corner (diamonds), each with an X whose
//    centre is lashed to the axle, joined by four corner poles. It is built standing
//    on its bottom corner between the tripods, and six scouts lift it into the forks.
//  - The seat: a small flat klaf with an X, built on the ground under the wheel,
//    lifted and hung on four ropes from the bottom corner pole.
//
// World coordinates: x across, y up, z along the axle. The upright legs stand at
// x = 0, z = 0 (front tripod) and z = apart (back tripod).
import { SIZES, LASH_ALLOW } from './blueprints.js';
import { LEVEL } from './level1.js';
import { World } from './physics.js';
import { fitAllowance } from './allowance.js';
import { BRACES, legSOf } from './tripod.js';

export const WH = SIZES.wheel;
const r = LEVEL.poleRadius;
const D = WH.apart, F = WH.forkHeight;

// ---------------- the 90° tripods ----------------
// lying side by side with their tops together: the upright leg (shorter) in the middle
function tri90() {
  const Lu = WH.uprightLength, Ll = WH.leanLength, top = Math.max(Lu, Ll);
  // Omer (11-21): four legs, two upright side by side and two leaning; laid side by side,
  // the uprights in the middle (t4 is the second upright: it stands beside t2)
  const leg = (id, he, u, L) => ({ id, he, centre: [u, top - L / 2], dir: [0, 1], length: L, layer: 0, kind: 'v' });
  const slots = [leg('t1', 'רגל נוטה ימנית', -0.21, Ll), leg('t2', 'רגל זקופה ימנית', -0.07, Lu), leg('t3', 'רגל נוטה שמאלית', 0.21, Ll), leg('t4', 'רגל זקופה שמאלית', 0.07, Lu)];
  const joints = [{ id: 'TJ', a: 't1', b: 't3', all: slots.map(q => q.id), at: [0, top - WH.lashFromTop], correct: 'tripod' }];
  const spec = {
    slots, joints, lashV: top - WH.lashFromTop, lashFromTop: WH.lashFromTop, height: F, ninety: true,
    twin: { id: 't4', of: 1, offset: [2 * r + 0.02, 0, 0] },
    // c: where the upright leg stands; out: -1 for the front tripod, +1 for the back one
    planFeet: (c, out = -1) => [[c[0] + WH.footSide, c[1] + out * WH.footOut], [c[0], c[1]], [c[0] - WH.footSide, c[1] + out * WH.footOut]],
  };
  const f = spec.planFeet([0, 0]), d = (a, b) => Math.hypot(f[a][0] - f[b][0], f[a][1] - f[b][1]);
  spec.apart = [d(0, 1), d(1, 2), d(2, 0)];
  // the braces at about 50 cm, with מרחק כפיתה at both ends, in 10 cm steps
  const s = [Ll, Lu, Ll].map((l, i) => legSOf(spec, i, l)), hb = 0.5;
  spec.braceLengths = Object.fromEntries(BRACES.map(b => {
    const k = 1 - hb / F, gap = d(b.legs[0], b.legs[1]) * k;
    return [b.id, Math.ceil((gap + 2 * LASH_ALLOW) * 10 - 1e-6) / 10];
  }));
  spec.legLengths = [Ll, Lu, Ll];
  return spec;
}
export const TRI90 = tri90();

// ---------------- the wheel ----------------
export const AXLE_Y = F + WH.axleAbove;
const ZS = [WH.inset, D - WH.inset];            // the two squares
const R = WH.radius;
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const unit2 = a => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };
// corner k of a square, around the axle (k = 0 the bottom, then counter-clockwise seen from the front)
export const wcorner = k => { const a = (-90 + 90 * ((k % 4) + 4) % 360) * Math.PI / 180; return [R * Math.cos(a), R * Math.sin(a)]; };
const sideU = k => unit2(sub2(wcorner(k + 1), wcorner(k)));       // side k runs from corner k to corner k+1
const radial = k => unit2(wcorner(k));
const cornerPoleAt = k => { const c = wcorner(k), n = radial(k); return [c[0] + n[0] * WH.cornerOut, c[1] + n[1] * WH.cornerOut]; };
const diagEnd = k => { const c = wcorner(k), u = sideU(k - 1); return [c[0] - u[0] * WH.diagIn, c[1] - u[1] * WH.diagIn]; };
const W3 = (p, z) => [p[0], AXLE_Y + p[1], z];
const sideName = ['ימין־למטה', 'ימין־למעלה', 'שמאל־למעלה', 'שמאל־למטה'];
const sqName = q => q ? 'ריבוע אחורי' : 'ריבוע קדמי';
function line(id, he, a, b, extra = {}) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
  return { id, he, centre: a.map((v, i) => (v + b[i]) / 2), dir: d.map(v => v / L), length: L, ...extra };
}
function wheelPlan() {
  const slots = [], joints = [];
  ZS.forEach((z, q) => {
    const Q = q + 1, out = q ? 1 : -1;
    for (let k = 0; k < 4; k++) slots.push(line(`W.s${Q}${k}`, `צלע ${sideName[k]} (${sqName(q)})`, W3(wcorner(k), z), W3(wcorner(k + 1), z), { part: 'wheel', sq: q, side: k, layer: out * (1 + (k % 2)) }));
    slots.push(line(`W.dA${Q}`, `אלכסון מלמטה למעלה (${sqName(q)})`, W3(diagEnd(0), z), W3(diagEnd(2), z), { part: 'wheel', sq: q, diag: 'A', layer: -out }));
    slots.push(line(`W.dB${Q}`, `אלכסון מימין לשמאל (${sqName(q)})`, W3(diagEnd(1), z), W3(diagEnd(3), z), { part: 'wheel', sq: q, diag: 'B', layer: -2 * out }));
    for (let k = 0; k < 4; k++) {
      joints.push({ id: `W.k${Q}${k}`, a: `W.s${Q}${(k + 3) % 4}`, b: `W.s${Q}${k}`, at: W3(wcorner(k), z), correct: 'square', part: 'wheel', sq: q, corner: k });
      joints.push({ id: `W.e${Q}${k}`, a: `W.d${k % 2 ? 'B' : 'A'}${Q}`, b: `W.s${Q}${(k + 3) % 4}`, at: W3(diagEnd(k), z), correct: 'cross', part: 'wheel', sq: q, xEnd: k });
    }
    joints.push({ id: `W.x${Q}`, a: `W.dA${Q}`, b: `W.dB${Q}`, at: W3([0, 0], z), correct: 'square', part: 'wheel', sq: q, xc: true });
    // the X's centre on the axle (its ring sits a little inside the square, beside the X's own lashing)
    joints.push({ id: `W.a${Q}`, a: 'W.axle', b: `W.dA${Q}`, at: W3([0, 0], z - out * 0.12), correct: 'square', part: 'wheel', sq: q, axle: true });
  });
  for (let k = 0; k < 4; k++) {
    const p = cornerPoleAt(k);
    slots.push(line(`W.c${k}`, k ? `סנדת פינה ${['', 'ימנית', 'עליונה', 'שמאלית'][k]}` : 'סנדת הפינה התחתונה (המושב תלוי עליה)', W3(p, ZS[0]), W3(p, ZS[1]), { part: 'wheel', corner: k, layer: 0 }));
    ZS.forEach((z, q) => joints.push({ id: `W.p${q + 1}${k}`, a: `W.c${k}`, b: `W.s${q + 1}${k}`, at: W3(p, z), correct: 'square', part: 'wheel', sq: q, cornerPole: k }));
  }
  slots.push(line('W.axle', 'הציר', [0, AXLE_Y, -WH.axleOver], [0, AXLE_Y, D + WH.axleOver], { part: 'wheel', axle: true, layer: 0 }));
  return { slots, joints };
}
export const WHEEL = wheelPlan();
fitAllowance(WHEEL.slots.filter(s => !s.axle), WHEEL.joints);
// the wheel is built standing on its bottom corner, and lifted this far into the forks
export const WHEEL_DROP = AXLE_Y - WH.lowAxle;
export const WHEEL_Z = D / 2;

// ---------------- the seat ----------------
const ST = WH.seat;
const POLE0 = cornerPoleAt(0);
export const SEAT_Y = AXLE_Y + POLE0[1] - ST.hang;    // the seat's height once it hangs
const SC = [POLE0[0], WHEEL_Z];                        // its centre, under the bottom corner pole
const sw = ST.width / 2, sl = ST.length / 2;
const S3 = (x, z) => [SC[0] + x, SEAT_Y, SC[1] + z];
// its corners: 0 front right, 1 front left, 2 back left, 3 back right (+x is the left, seen from the front)
export const seatCorner = k => [[-sw, -sl], [sw, -sl], [sw, sl], [-sw, sl]][k];
function seatPlan() {
  const slots = [
    line('W.gL1', 'סנדת אורך ימנית', S3(-sw, -sl), S3(-sw, sl), { part: 'seat', layer: 0 }),
    line('W.gL2', 'סנדת אורך שמאלית', S3(sw, -sl), S3(sw, sl), { part: 'seat', layer: 0 }),
    line('W.gE1', 'סנדת רוחב קדמית', S3(-sw, -sl), S3(sw, -sl), { part: 'seat', layer: 1 }),
    line('W.gE2', 'סנדת רוחב אחורית', S3(-sw, sl), S3(sw, sl), { part: 'seat', layer: 1 }),
  ];
  const di = ST.diagIn;
  slots.push(line('W.gA', 'אלכסון במושב, ימין־קדימה לשמאל־אחורה', S3(-sw, -sl + di), S3(sw, sl - di), { part: 'seat', layer: -1 }));
  slots.push(line('W.gB', 'אלכסון במושב, שמאל־קדימה לימין־אחורה', S3(sw, -sl + di), S3(-sw, sl - di), { part: 'seat', layer: -2 }));
  const joints = [];
  const longOf = x => x < 0 ? 'W.gL1' : 'W.gL2';
  [0, 1, 2, 3].forEach(k => {
    const [x, z] = seatCorner(k);
    joints.push({ id: `W.gc${k + 1}`, a: longOf(x), b: z < 0 ? 'W.gE1' : 'W.gE2', at: S3(x, z), correct: 'square', part: 'seat', corner: k });
  });
  [['W.gA', -sw, -sl + di], ['W.gA', sw, sl - di], ['W.gB', sw, -sl + di], ['W.gB', -sw, sl - di]].forEach(([d, x, z], i) =>
    joints.push({ id: `W.gd${i + 1}`, a: d, b: longOf(x), at: S3(x, z), correct: 'cross', part: 'seat' }));
  joints.push({ id: 'W.gx', a: 'W.gA', b: 'W.gB', at: S3(0, 0), correct: 'cross', part: 'seat' });
  return { slots, joints };
}
export const GOND = seatPlan();
fitAllowance(GOND.slots, GOND.joints);
// the four hanging ropes: from each corner of the seat up to the bottom corner pole, above that end of the seat
export const SEAT_ROPES = [0, 1, 2, 3].map(k => ({ id: `W.h${k + 1}`, corner: k }));
export const ropeTop = k => [POLE0[0], AXLE_Y + POLE0[1], SC[1] + seatCorner(k)[1]];
export const ropeFoot = k => S3(...seatCorner(k));
// the seat is built lying on the ground, and lifted this far to hang
export const SEAT_DROP = SEAT_Y - r;
export const SEAT_C = SC;
export const RIG = { slots: [...WHEEL.slots, ...GOND.slots], joints: [...WHEEL.joints, ...GOND.joints] };

// ---------------- the ride's physics ----------------
export const WH_TUNING = {
  rider: 330,          // N each of the two riders (about 34 kg)
  spinOmega: 0.9,      // rad/s the crew turns it at (a turn in about 7 s)
  spinPush: 320,       // N at most, at each corner pole, to turn it with
  sidePush: 220,       // N the מדריך pushes the seat along the axle with
  jointGive: 5e-4,     // how much a lashing lets its two poles turn
  rackLimit: 0.12,     // m a square's diagonal may change before it counts as folded
  slipLimit: 0.15,     // m a square's centre may move off the axle
  seatTilt: 0.22,      // m one end of the seat may hang lower than the other
  seatBend: 0.1,       // m a corner of the seat may sag below its frame
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const param = (slot, p) => dot(sub(p, slot.centre), slot.dir);
const rigidAll = (W, ids) => { for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) W.add('rigid', ids[a], ids[b], { tag: 'pole' }); };
const slotOf = id => RIG.slots.find(s => s.id === id);
// can this rig lashing be tied, with the poles as placed? (מרחק כפיתה)
export function rigReachable(j, poles) {
  for (const sid of [j.a, j.b]) {
    const p = poles[sid]; if (!p) return false;
    if (Math.abs(param(slotOf(sid), j.at)) > p.length / 2 - LASH_ALLOW + 0.005) return false;
  }
  return true;
}

// The wheel and its seat in a world of their own. The axle lies on two pivots
// that follow the towers' forks (setPivots); its load goes back to the towers.
export class WheelSim {
  // build: { poles, joints } for the wheel and the seat; hang: { ropes: {W.h1…}, seat: bool }
  constructor(build, hang) {
    const W = this.world = new World();
    W.iterations = 4; W.damping = 0.3;
    this.build = build;
    this.poles = {};
    const mass = LEVEL.kgPerMetre;
    const parts = RIG.slots.filter(s => s.part === 'wheel' || hang.seat);
    for (const s of parts) {
      const p = build.poles[s.id]; if (!p) continue;
      const half = p.length / 2, ss = new Set([-half, half, 0]);
      for (const j of RIG.joints) if (j.a === s.id || j.b === s.id) {
        // a lashing on the axle sits on the square's own plane (its ring is drawn beside it)
        const at = j.axle ? [j.at[0], j.at[1], ZS[j.sq]] : j.at;
        const t = param(s, at); if (Math.abs(t) <= half - 0.03) ss.add(Math.round(t * 1000) / 1000);
      }
      if (s.axle) for (const z of [0, D]) ss.add(Math.round(param(s, [0, AXLE_Y, z]) * 1000) / 1000);
      if (s.corner === 0) for (let k = 0; k < 4; k++) ss.add(Math.round(param(s, ropeTop(k)) * 1000) / 1000);
      if (s.part === 'seat' && s.dir[2] > 0.9) for (const z of [-0.3, 0.3]) ss.add(Math.round(param(s, S3(s.centre[0] - SC[0], z)) * 1000) / 1000);
      const list = [...ss].filter(t => Math.abs(t) <= half + 1e-6).sort((a, b) => a - b);
      this.poles[s.id] = list.map(t => ({ t, id: W.addParticle(s.centre.map((v, i) => v + s.dir[i] * t), p.length * mass / list.length, r) }));
      rigidAll(W, this.poles[s.id].map(q => q.id));
    }
    this.cons = {};
    for (const j of RIG.joints) {
      if (!build.joints[j.id] || !rigReachable(j, build.poles)) continue;
      const at = j.axle ? [j.at[0], j.at[1], ZS[j.sq]] : j.at;
      const a = this.near(j.a, at), b = this.near(j.b, at);
      if (a == null || b == null) continue;
      this.cons[j.id] = W.add('weld', a, b, { tag: j.id });
      // a tight lashing also holds the angle between its two poles
      if (!j.axle) for (const na of this.nextTo(j.a, a)) for (const nb of this.nextTo(j.b, b)) W.add('rigid', na, nb, { tag: j.id, compliance: WH_TUNING.jointGive });
    }
    // the axle lies in the two forks and turns there
    this.pivots = [0, D].map(z => W.addParticle([0, AXLE_Y, z], 0));
    if (this.poles['W.axle']) this.pivots.forEach((pv, i) => { const q = this.near('W.axle', [0, AXLE_Y, i * D]); if (q != null) W.add('weld', q, pv, { tag: 'fork' + i }); });
    // the seat's hanging ropes
    this.ropes = {};
    if (hang.seat) for (const h of SEAT_ROPES) {
      if (!hang.ropes[h.id]) continue;
      const top = this.near('W.c0', ropeTop(h.corner)), [x, z] = seatCorner(h.corner);
      const foot = this.near(x < 0 ? 'W.gL1' : 'W.gL2', ropeFoot(h.corner));
      if (top != null && foot != null) this.ropes[h.id] = W.add('rope', top, foot, { tag: h.id });
    }
    this.angle = 0; this.spin = 0; this.lastA = this.wheelAngle();
  }
  near(sid, p) {
    const P = this.poles[sid]; if (!P) return null;
    const s = slotOf(sid), t = param(s, p);
    let best = null, bd = 0.06;
    for (const q of P) { const d = Math.abs(q.t - t); if (d < bd) { bd = d; best = q.id; } }
    return best;
  }
  nextTo(sid, id) { const P = this.poles[sid], i = P.findIndex(q => q.id === id); return [P[i - 1], P[i + 1]].filter(Boolean).map(q => q.id); }
  pos(id) { return this.world.p[id].x; }
  // the particle of a pole nearest one of its points in the plan
  at(sid, p) { const q = this.near(sid, p); return q == null ? null : this.pos(q); }
  setPivots(ps) { ps.forEach((p, i) => { const q = this.world.p[this.pivots[i]]; q.x = [...p]; q.prev = [...p]; }); }
  axleAt() { const a = this.pos(this.pivots[0]), b = this.pos(this.pivots[1]); return [a, b]; }
  // where a corner pole is round the axle (its middle), as an angle
  wheelAngle() {
    for (let k = 0; k < 4; k++) {
      const P = this.poles[`W.c${k}`]; if (!P) continue;
      const m = P.find(q => Math.abs(q.t) < 1e-6) || P[0], x = this.pos(m.id);
      return Math.atan2(x[1] - AXLE_Y, x[0]) - (-Math.PI / 2 + k * Math.PI / 2);
    }
    return 0;
  }
  // how far a point is from the axle's line
  offAxle(p) {
    const [a, b] = this.axleAt(), d = sub(b, a), L = Math.hypot(...d), u = d.map(v => v / L), w = sub(p, a), t = dot(w, u);
    return Math.hypot(...sub(w, u.map(v => v * t)));
  }
  // the worst fold of a square: its diagonals, corner to corner, against the drawing (2R)
  rack() {
    let m = 0;
    for (const Q of [1, 2]) for (const [k1, k2] of [[0, 2], [1, 3]]) {
      const c = k => { const s = slotOf(`W.s${Q}${k}`); return this.poles[s.id] ? this.at(s.id, W3(wcorner(k), ZS[Q - 1])) : null; };
      const p = c(k1), q = c(k2); if (!p || !q) continue;
      m = Math.max(m, Math.abs(Math.hypot(...sub(p, q)) - 2 * R));
    }
    return m;
  }
  // the worst square centre off the axle (where its X crosses, or the middle of its corners)
  slip() {
    let m = 0;
    for (const Q of [1, 2]) {
      const ps = [0, 1, 2, 3].map(k => this.poles[`W.s${Q}${k}`] ? this.at(`W.s${Q}${k}`, W3(wcorner(k), ZS[Q - 1])) : null).filter(Boolean);
      if (!ps.length) continue;
      const c = [0, 1, 2].map(i => ps.reduce((a, p) => a + p[i], 0) / ps.length);
      m = Math.max(m, this.offAxle(c));
    }
    return m;
  }
  seatCorners() {
    const ids = [0, 1, 2, 3].map(k => { const [x] = seatCorner(k); return this.poles[x < 0 ? 'W.gL1' : 'W.gL2'] ? this.at(x < 0 ? 'W.gL1' : 'W.gL2', ropeFoot(k)) : null; });
    return ids;
  }
  // one end of the seat lower than the other (along the axle), or the seat fallen
  seatTilt() {
    const c = this.seatCorners(); if (c.some(q => !q)) return 0;
    const front = (c[0][1] + c[1][1]) / 2, back = (c[2][1] + c[3][1]) / 2;
    return Math.abs(front - back);
  }
  // a corner of the seat sagging below the other three
  seatBend() {
    const c = this.seatCorners(); if (c.some(q => !q)) return 0;
    // the four corners of a flat frame lie in a plane: c0 + c2 = c1 + c3
    return Math.hypot(...sub(c[0].map((v, i) => v + c[2][i]), c[1].map((v, i) => v + c[3][i]))) / 2;
  }
  // how far below the bottom corner pole the seat hangs (it should be the rope's length)
  seatDrop() {
    const c = this.seatCorners(), P = this.poles['W.c0']; if (c.some(q => !q) || !P) return 0;
    const pole = this.pos((P.find(q => Math.abs(q.t) < 1e-6) || P[0]).id), y = c.reduce((a, q) => a + q[1], 0) / 4;
    return Math.max(0, (pole[1] - y) - ST.hang) + Math.max(0, r + 0.15 - y) * 0; // (a seat far below its pole fell off it)
  }
  // the weight on each fork
  forkLoads() { return this.pivots.map((_, i) => { const c = this.world.c.find(q => q.tag === 'fork' + i); return c ? c.force : 0; }); }
  mass() { let kg = 0; for (const p of this.world.p) if (p.w) kg += 1 / p.w; return kg; }
  // the riders sit on the seat's long poles, side by side along the axle
  riderSpots() {
    const out = [];
    for (const z of [-0.3, 0.3]) for (const sid of ['W.gL1', 'W.gL2']) { const s = slotOf(sid); if (this.poles[sid]) out.push(this.near(sid, S3(s.centre[0] - SC[0], z))); }
    return out.filter(q => q != null);
  }
  step(dt, { riders = 0, spin = false, side = null } = {}) {
    const W = this.world;
    const spots = this.riderSpots();
    if (riders && spots.length) for (const id of spots) W.applyForce(id, [0, -WH_TUNING.rider * Math.min(2, riders) / spots.length, 0]);
    if (spin) {
      // the crew turns it by its corner poles until it goes round fast enough
      const f = this.spin < WH_TUNING.spinOmega ? WH_TUNING.spinPush * Math.min(1, (WH_TUNING.spinOmega - this.spin) * 3 + 0.3) : 0;
      if (f > 0) for (let k = 0; k < 4; k++) {
        const P = this.poles[`W.c${k}`]; if (!P) continue;
        const id = (P.find(q => Math.abs(q.t) < 1e-6) || P[0]).id, x = this.pos(id), dx = x[0], dy = x[1] - AXLE_Y, l = Math.hypot(dx, dy) || 1;
        W.applyForce(id, [-dy / l * f, dx / l * f, 0]);
      }
    }
    if (side) {
      const ids = ['W.gE1', 'W.gE2'].map(s => this.poles[s]?.find(q => Math.abs(q.t) < 1e-6)?.id).filter(id => id != null);
      for (const id of ids) W.applyForce(id, side.map(v => v / ids.length));
    }
    W.step(Math.min(dt, 1 / 30), 20);
    const a = this.wheelAngle();
    let da = a - this.lastA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    this.lastA = a; this.angle += da;
    this.spin = this.spin * 0.9 + (da / Math.max(1e-4, Math.min(dt, 1 / 30))) * 0.1;
  }
}
