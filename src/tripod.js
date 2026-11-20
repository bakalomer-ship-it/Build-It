// The tripod (חצובה): three legs lashed together near their tops while they lie
// side by side on the ground, stood up, and spread into a triangle. Braces low
// between the legs, and a stake at each foot, keep the feet where they are.
//
// The legs lie on the ground as three slots of an ordinary plan (see setPlan in
// level1.js), so placing them and tying the lashing work as for a klaf. Once it
// stands, the tripod is described by where its three feet are: the head is
// wherever three legs of those lengths meet.
import { SIZES, LASH_ALLOW } from './blueprints.js';
import { World } from './physics.js';
import { LEVEL } from './level1.js';

export const TRI = SIZES.tripod;
const r = LEVEL.poleRadius;
const LASH_V = TRI.legLength - TRI.lashFromTop;

// lying side by side, tops together (klaf-plane coordinates: u across, v along the legs)
export const TRI_SLOTS = [-1, 0, 1].map((k, i) => ({
  id: 't' + (i + 1), he: ['רגל ימנית', 'רגל אמצעית', 'רגל שמאלית'][i],
  centre: [k * 0.14, TRI.legLength / 2], dir: [0, 1], length: TRI.legLength, layer: 0, kind: 'v',
}));
export const LEG_IDS = TRI_SLOTS.map(s => s.id);
// one lashing round all three
export const TRI_JOINTS = [{ id: 'TJ', a: 't1', b: 't3', all: LEG_IDS, at: [0, LASH_V], correct: 'tripod' }];

// the braces: one between every two legs
export const BRACES = [
  { id: 'B12', he: 'חיזוק בין הרגל הימנית לאמצעית', legs: [0, 1], length: TRI.braceLength },
  { id: 'B23', he: 'חיזוק בין הרגל האמצעית לשמאלית', legs: [1, 2], length: TRI.braceLength },
  { id: 'B31', he: 'חיזוק בין הרגל השמאלית לימנית', legs: [2, 0], length: TRI.braceLength },
];
export const BRACE_JOINTS = BRACES.flatMap(b => b.legs.map((leg, k) => ({ id: `${b.id}.${k + 1}`, brace: b.id, leg, correct: 'square' })));
export const TRI_STAKES = LEG_IDS.map((id, i) => ({ id: 'TS' + (i + 1), leg: i }));
export const TRI_STAKE_JOINTS = TRI_STAKES.map(s => ({ id: 'TL' + (s.leg + 1), stake: s.id, leg: s.leg, correct: 'parallel' }));
export const TRI_STAKE_HITS = 4;

// How far along a leg, from its foot, the lashing sits. A pole lies centred on
// its line, so a shorter pole has less leg below the lashing.
export const legS = len => TRI_JOINTS[0].at[1] - (TRI.legLength - len) / 2;
// Free tripod: legs of any length lie centred on their lines, so the lashing
// moves down to sit 25 cm below the shortest leg's top (the levels keep the drawing's place).
export function setLashFor(lens) {
  const shortest = lens?.length ? Math.min(...lens) : TRI.legLength;
  TRI_JOINTS[0].at[1] = lens?.length ? TRI.legLength / 2 + shortest / 2 - TRI.lashFromTop : LASH_V;
}

// A tripod's drawing: how its legs lie, where its feet stand and what fits it.
// The station-3 tripod is the default; the giant wheel's 90° tripods have their own.
export const TRI_SPEC = {
  slots: TRI_SLOTS, joints: TRI_JOINTS,
  get lashV() { return TRI_JOINTS[0].at[1]; },
  lashFromTop: TRI.lashFromTop, height: TRI.height,
  apart: [TRI.footApart, TRI.footApart, TRI.footApart],
  braceLengths: Object.fromEntries(BRACES.map(b => [b.id, b.length])),
  planFeet: c => planFeet(c),
};
// how far along leg i, from its foot, the lashing sits: a pole lies centred on its line
export const legSOf = (spec, i, len) => spec.lashV - (spec.slots[i].centre[1] - len / 2);
// where the feet stand when the bundle has just been stood up: a small triangle
export function startFeet(c, radius = 0.4) {
  return [210, 90, 330].map(d => { const a = d * Math.PI / 180; return [c[0] + radius * Math.cos(a), c[1] + radius * Math.sin(a)]; });
}
// the feet of the tripod in the drawing
export function planFeet(c) { return startFeet(c, TRI.footApart / Math.sqrt(3)); }

// The head of the tripod: the point that is s[i] from foot i, above the ground.
// feet are [x, z]; returns [x, y, z], or null when the legs cannot meet there.
export function apexOf(feet, s) {
  const [[x1, z1], [x2, z2], [x3, z3]] = feet;
  const a1 = 2 * (x2 - x1), b1 = 2 * (z2 - z1), c1 = x2 * x2 + z2 * z2 - x1 * x1 - z1 * z1 - s[1] * s[1] + s[0] * s[0];
  const a2 = 2 * (x3 - x1), b2 = 2 * (z3 - z1), c2 = x3 * x3 + z3 * z3 - x1 * x1 - z1 * z1 - s[2] * s[2] + s[0] * s[0];
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-4) return null;
  const x = (c1 * b2 - c2 * b1) / det, z = (a1 * c2 - a2 * c1) / det;
  const y2 = s[0] * s[0] - (x - x1) ** 2 - (z - z1) ** 2;
  if (y2 < 0.25) return null;
  return [x, Math.sqrt(y2) + r, z];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = a => Math.hypot(a[0], a[1], a[2]);
const along = (a, d, k) => [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];

// a standing tripod, as points: for each leg its foot, its direction, the point at
// the braces' height, and its top
export function standing(feet, lens, spec = TRI_SPEC) {
  const s = lens.map((l, i) => legSOf(spec, i, l));
  const apex = apexOf(feet, s); if (!apex) return null;
  const legs = feet.map((f, i) => {
    const foot = [f[0], r, f[1]];
    const d = sub(apex, foot), l = len3(d), dir = d.map(v => v / l);
    const sb = Math.min(s[i] - 0.3, TRI.braceHeight / Math.max(0.2, dir[1]));
    return { foot, dir, s: s[i], top: along(foot, dir, lens[i]), brace: along(foot, dir, sb), sb, stake: along(foot, dir, TRI.stakeJointHeight / Math.max(0.2, dir[1])) };
  });
  const d = (a, b) => Math.hypot(feet[a][0] - feet[b][0], feet[a][1] - feet[b][1]);
  return { apex, legs, apart: [d(0, 1), d(1, 2), d(2, 0)], height: apex[1] - r };
}
// does a brace of this length reach both of its legs?
export function braceReaches(st, brace, length) {
  const [a, b] = brace.legs.map(i => st.legs[i].brace);
  return length >= len3(sub(a, b)) + 2 * LASH_ALLOW; // מרחק כפיתה at both ends
}
// how close the standing tripod is to the drawing: its height and the three distances between the feet
export function fitsPlan(st, spec = TRI_SPEC) {
  return {
    height: Math.abs(st.height - spec.height) <= 0.1,
    apart: st.apart.map((d, i) => Math.abs(d - spec.apart[i]) <= 0.1),
  };
}

export const TRI_TUNING = {
  footHold: 45,      // N the sand holds a foot with before it slides
  push: 70,          // N the inspection's push at the head
  load: 600,         // N the inspection's load on the head (the מדריך hangs on it)
};

// The inspection's physics. Poles are rigid chains, the tripod lashing joins the
// three heads, a brace tied at both ends keeps its two legs apart, a foot lashed
// to its stake stays put, and any other foot is held only by the sand.
export class TripodSim {
  // world: a world shared with other structures (the giant wheel's two tripods)
  constructor({ feet, lens, braces, joints, stakes, stakeJoints, spec = TRI_SPEC, world = null }) {
    const st = standing(feet, lens, spec);
    const W = this.world = world || new World();
    if (!world) { W.mu = 0; W.iterations = 3; }
    this.h0 = st.apex[1];
    this.legs = st.legs.map((L, i) => {
      const ss = [0, L.sb, L.s, lens[i]];
      const kg = LEVEL.kgPerMetre * lens[i];
      const ids = ss.map((sv, k) => W.addParticle(along(L.foot, L.dir, sv), kg * [0.2, 0.3, 0.3, 0.2][k], r));
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) W.add('rigid', ids[a], ids[b], { tag: 'pole' });
      return { foot: ids[0], brace: ids[1], head: ids[2], top: ids[3] };
    });
    // the tripod lashing: the three heads stay together
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) W.add('weld', this.legs[a].head, this.legs[b].head, { compliance: 1e-6 });
    this.braced = BRACES.filter(b => braces[b.id] && braceReaches(st, b, braces[b.id].length) && joints[`${b.id}.1`] && joints[`${b.id}.2`]);
    for (const b of this.braced) W.add('rigid', this.legs[b.legs[0]].brace, this.legs[b.legs[1]].brace, { compliance: 1e-6, tag: b.id });
    this.holds = [];
    this.staked = [];
    this.legs.forEach((L, i) => {
      const p = W.p[L.foot].x;
      const hold = W.addParticle(p, 0);
      const tied = (stakes[TRI_STAKES[i].id] || 0) >= TRI_STAKE_HITS && stakeJoints[TRI_STAKE_JOINTS[i].id];
      this.staked.push(!!tied);
      if (tied) W.add('weld', L.foot, hold, { compliance: 1e-6 });
      else this.holds.push(W.add('slide', L.foot, hold, { cap: TRI_TUNING.footHold, origin: [...p] }));
    });
  }
  pos(id) { return this.world.p[id].x; }
  apex() { const P = this.legs.map(L => this.pos(L.head)); return [0, 1, 2].map(k => (P[0][k] + P[1][k] + P[2][k]) / 3); }
  // each leg as drawn: foot and top
  legEnds(i) { return [this.pos(this.legs[i].foot), this.pos(this.legs[i].top)]; }
  bracePoint(i) { return this.pos(this.legs[i].brace); }
  slid() { return Math.max(0, ...this.holds.map(c => c.slid)); }
  sunk() { return this.h0 - this.apex()[1]; }
  forces({ push = null, load = 0 } = {}) {
    const W = this.world;
    for (const L of this.legs) {
      if (push) W.applyForce(L.head, push.map(v => v / 3));
      if (load) W.applyForce(L.head, [0, -load / 3, 0]);
    }
  }
  step(dt, f = {}) { this.forces(f); this.world.step(dt, 30); }
}
