// Free build (בנייה חופשית): the player designs the klaf. No drawing to follow:
// poles from the pile are laid on a ground grid, lashed wherever they cross,
// and then the klaf goes through the same real steps as in the levels
// (stakes, raise, anchor) and is judged only by the inspection (מסדר).
//
// A free klaf lives in the same plan arrays as the levels' klaf (see setPlan in
// level1.js), so the building, the physics and the inspection are shared.
// Coordinates are the klaf's own plane: u across (+u on the left as the pullers
// see it), v up from the foot line.

import { LASH_ALLOW } from './blueprints.js';

// the grid the klaf is designed on
export const GRID = { uMax: 3.5, vMin: -0.3, vMax: 5.0, step: 0.1 };

export const FREE_LEVEL = {
  number: 0, free: true, name: 'בנייה חופשית', tutorial: false, crew: 6, ropeSpare: 6, targetTimeSec: 0,
  // where the klaf stands and how far out its guy stakes go: filled in from the legs (freeCfg)
  klafim: [{ z0: 0, frontDist: 2, backDist: 2, pullDist: 3.4, anchorX: { front: 1, back: 1 }, inner: 0, he: 'קלף' }],
};

const snap = x => Math.round(x / GRID.step) * GRID.step;
const round3 = x => Math.round(x * 1000) / 1000;

// A pole laid from where the finger went down (a) towards where it is now (b).
// The start snaps to the grid, and to the foot line when it is near it; the
// direction snaps to upright or level when it is close to them.
// The pole is as long as the drag (in 10 cm steps): the player chooses the length
// by drawing it. A tap, with no drag, stands a pole of the last length upright.
export const POLE_MIN = 0.5, POLE_MAX = 7.0;
export function layPole(a, b, lastLength) {
  let u = snap(a[0]), v = snap(a[1]);
  if (v < 0.15 && v > -0.2) v = 0;
  let du = b[0] - u, dv = b[1] - v;
  const l = Math.hypot(du, dv);
  let length = lastLength;
  if (l < 0.25) { du = 0; dv = 1; } else { du /= l; dv /= l; length = Math.max(POLE_MIN, Math.min(POLE_MAX, Math.round(l * 10) / 10)); }
  let ang = Math.atan2(dv, du);
  const near = t => Math.abs(Math.atan2(Math.sin(ang - t), Math.cos(ang - t))) < 0.14;
  for (const t of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) if (near(t)) ang = t;
  du = Math.cos(ang); dv = Math.sin(ang);
  const eu = u + du * length, ev = v + dv * length;
  // every pole runs "upwards" (or left to right), so its first end is the lower one
  let p0 = [u, v], p1 = [eu, ev];
  if (p1[1] < p0[1] - 1e-6 || (Math.abs(p1[1] - p0[1]) < 1e-6 && p1[0] < p0[0])) [p0, p1] = [p1, p0];
  // an upright pole that ends near the ground stands on the foot line: it is a leg
  if (Math.abs(du) < 1e-6 && p0[1] > 0 && p0[1] < 0.35) { p1 = [p1[0], p1[1] - p0[1]]; p0 = [p0[0], 0]; }
  const d = [p1[0] - p0[0], p1[1] - p0[1]], dl = Math.hypot(d[0], d[1]) || 1;
  const dir = [d[0] / dl, d[1] / dl];
  const centre = [round3(p0[0] + dir[0] * length / 2), round3(p0[1] + dir[1] * length / 2)];
  return { centre, dir, length, kind: kindOf(dir), foot: p0[1] < 0.02 };
}
// upright, level, or a diagonal
export function kindOf(dir) {
  if (Math.abs(dir[0]) < 0.05) return 'v';
  if (Math.abs(dir[1]) < 0.05) return 'h';
  return 'd';
}
export function onSheet(pole) {
  const h = pole.length / 2;
  for (const k of [-h, h]) {
    const u = pole.centre[0] + pole.dir[0] * k, v = pole.centre[1] + pole.dir[1] * k;
    if (Math.abs(u) > GRID.uMax + 0.01 || v < -0.01 || v > GRID.vMax + 0.01) return false;
  }
  return true;
}

// Which id a new pole gets. The physics and the raise know a klaf by its two legs
// (legL on the right as the pullers see it, u < 0; legR on the left, u > 0): an
// upright pole that stands on the foot line is a leg. Diagonals are 'diag…' (they
// bow when pushed along their length), everything else is a plain pole.
export function idFor(pole, slots) {
  if (pole.kind === 'v' && pole.foot && Math.abs(pole.centre[0]) > 0.05) {
    const id = pole.centre[0] < 0 ? 'legL' : 'legR';
    if (!slots.some(s => s.id === id)) return id;
    return null; // that side already has its leg
  }
  const pre = pole.kind === 'd' ? 'diag' : pole.kind === 'h' ? 'h' : 'v';
  for (let i = 1; i < 40; i++) if (!slots.some(s => s.id === pre + i)) return pre + i;
  return null;
}
const NAME = { v: 'עמוד', h: 'רוחב', d: 'אלכסון' };
export function slotFor(id, pole) {
  const leg = id.startsWith('leg');
  return {
    id, he: leg ? (id === 'legR' ? 'רגל שמאל' : 'רגל ימין') : NAME[pole.kind],
    centre: pole.centre, dir: pole.dir, length: pole.length, kind: pole.kind,
    // which face of the klaf it lies on (drawing only): legs, then horizontals on top, diagonals underneath
    layer: leg ? 0 : pole.kind === 'h' ? 1 : pole.kind === 'd' ? -1 : 2,
  };
}

// Every place two poles cross is a place for a lashing. Square where they meet
// at a right angle, diagonal otherwise.
export function crossings(slots) {
  const out = [];
  for (let i = 0; i < slots.length; i++) for (let k = i + 1; k < slots.length; k++) {
    const A = slots[i], B = slots[k];
    const det = A.dir[0] * B.dir[1] - A.dir[1] * B.dir[0];
    if (Math.abs(det) < 0.08) continue; // (nearly) parallel poles don't cross
    const du = B.centre[0] - A.centre[0], dv = B.centre[1] - A.centre[1];
    const sa = (du * B.dir[1] - dv * B.dir[0]) / det, sb = (du * A.dir[1] - dv * A.dir[0]) / det;
    // מרחק כפיתה: a crossing nearer a pole's end than LASH_ALLOW cannot be lashed
    if (Math.abs(sa) > A.length / 2 - LASH_ALLOW + 0.005 || Math.abs(sb) > B.length / 2 - LASH_ALLOW + 0.005) continue;
    // legs first, so a joint reads "leg × pole" like the levels' joints
    const [a, b] = B.id.startsWith('leg') && !A.id.startsWith('leg') ? [B, A] : [A, B];
    out.push({
      id: `${a.id}*${b.id}`, a: a.id, b: b.id,
      at: [round3(A.centre[0] + A.dir[0] * sa), round3(A.centre[1] + A.dir[1] * sa)],
      correct: Math.abs(A.dir[0] * B.dir[0] + A.dir[1] * B.dir[1]) < 0.17 ? 'square' : 'cross',
    });
  }
  return out;
}

// the pole the inspection hangs its bucket from: the highest level pole lashed across the klaf
export function markLoad(slots) {
  let best = null;
  for (const s of slots) { delete s.load; if (s.kind === 'h' && (!best || s.centre[1] > best.centre[1])) best = s; }
  if (best) best.load = true;
}

// where the klaf stands and how far its guy stakes go: one klaf-height from the legs
export function freeCfg(cfg, slots) {
  const legs = slots.filter(s => s.id.startsWith('leg'));
  const H = legs.length ? Math.max(...legs.map(s => s.centre[1] + s.length / 2)) : 2;
  cfg.frontDist = cfg.backDist = H; cfg.pullDist = H + 1.4;
  return cfg;
}

// ---------------- joining klafim (Omer, 2026-11-21) ----------------
// Free-build klafim that stand one behind the other on the same line can be joined,
// like the cube station: between every two of them, a bottom and a top side pole on
// each side, an X on each side, and a flat X on top. Nothing is required: the player
// chooses which of these poles to put in. Lashings above 2.2 m are work at height.
export const JOIN_GAP = { min: 1.0, max: 6.5 };
// the klafim in rows: klaf entries at the same sideways place, each pair close enough to join
export function freeRows(cfgs) {
  const ks = cfgs.map((c, i) => ({ c, i })).filter(q => (q.c.kind || 'klaf') !== 'tripod');
  const rows = [];
  for (const q of ks) {
    if (rows.some(r => r.includes(q.i))) continue;
    const line = ks.filter(o => Math.abs((o.c.x0 || 0) - (q.c.x0 || 0)) < 0.05).sort((a, b) => a.c.z0 - b.c.z0);
    let run = [line[0]];
    const flush = () => { if (run.length > 1) rows.push(run.map(o => o.i)); };
    for (let n = 1; n < line.length; n++) {
      const gap = line[n].c.z0 - line[n - 1].c.z0;
      if (gap >= JOIN_GAP.min && gap <= JOIN_GAP.max) run.push(line[n]); else { flush(); run = [line[n]]; }
    }
    flush();
    for (const o of line) if (!rows.some(r => r.includes(o.i))) rows.push([o.i]);
  }
  return rows.filter(r => r.length > 1).sort((a, b) => b.length - a.length);
}
const up10 = x => Math.ceil(x * 10 - 1e-6) / 10;
// members: [{ z0, legL, legR }] front to back (legs are the klafim's leg slots); r: pole radius
export function freeJoinPlan(members, r, tag = '') {
  const slots = [], joints = [], xs = [], legV = members.map(() => new Set());
  const top = m => Math.min(...['legL', 'legR'].map(id => m[id].centre[1] + m[id].length / 2));
  const BOT = 0.45, INSET = 0.15;
  const pt = (m, side, v) => [m[side > 0 ? 'legR' : 'legL'].centre[0], r + v, m.z0];
  const pole = (id, he, a, b, kind, side, layer, extra = {}) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
    const s = { id, he, side, bay: extra.bay ?? 0, kind, layer, centre: a.map((v, i) => round3((v + b[i]) / 2)), dir: d.map(v => v / L), length: up10(L + 0.3), ...extra };
    slots.push(s); return s;
  };
  for (let p = 0; p + 1 < members.length; p++) {
    const A = members[p], B = members[p + 1], P = members.length > 2 ? ` · ${p + 1}–${p + 2}` : '';
    const hi = Math.min(top(A), top(B)) - 0.3;
    const legJ = (id, slot, k, side, v, correct) => {
      legV[p + k].add(round3(v));
      joints.push({ id, a: slot, klaf: p + k, leg: side > 0 ? 'legR' : 'legL', v: round3(v), correct, side, bay: p, at: pt(members[p + k], side, v) });
    };
    const tops = {};
    for (const side of [-1, 1]) {
      const S = (side > 0 ? 'L' : 'R') + p, name = side > 0 ? 'צד שמאל' : 'צד ימין';
      pole(`F.bot${S}`, `חיבור תחתון (${name}${P})`, pt(A, side, BOT), pt(B, side, BOT), 'h', side, 1, { bay: p });
      legJ(`F.b1${S}`, `F.bot${S}`, 0, side, BOT, 'square'); legJ(`F.b2${S}`, `F.bot${S}`, 1, side, BOT, 'square');
      if (hi - BOT >= 0.8) {
        tops[side] = pole(`F.top${S}`, `חיבור עליון (${name}${P})`, pt(A, side, hi), pt(B, side, hi), 'h', side, 1, { bay: p });
        legJ(`F.t1${S}`, `F.top${S}`, 0, side, hi, 'square'); legJ(`F.t2${S}`, `F.top${S}`, 1, side, hi, 'square');
      }
      // the X on the side, between the two side poles
      const lo = BOT + 0.25, up = (tops[side] ? hi : Math.min(top(A), top(B)) - 0.2) - 0.25;
      if (up - lo >= 0.6) {
        pole(`F.dA${S}`, `איקס בצד (${name}${P})`, pt(A, side, lo), pt(B, side, up), 'd', side, -1, { bay: p });
        pole(`F.dB${S}`, `איקס בצד (${name}${P})`, pt(A, side, up), pt(B, side, lo), 'd', side, -1, { bay: p });
        legJ(`F.x1${S}`, `F.dA${S}`, 0, side, lo, 'cross'); legJ(`F.x2${S}`, `F.dA${S}`, 1, side, up, 'cross');
        legJ(`F.x3${S}`, `F.dB${S}`, 0, side, up, 'cross'); legJ(`F.x4${S}`, `F.dB${S}`, 1, side, lo, 'cross');
        const c = [0, 1, 2].map(i => round3((pt(A, side, lo)[i] + pt(B, side, up)[i]) / 2));
        joints.push({ id: `F.x5${S}`, a: `F.dA${S}`, b: `F.dB${S}`, correct: 'cross', side, bay: p, at: c });
        xs.push({ ids: [`F.dA${S}`, `F.dB${S}`], where: `ב${name}${P}`, side });
      }
    }
    // the flat X on top, resting on the two top side poles, corner to corner
    if (tops[-1] && tops[1]) {
      const D = B.z0 - A.z0, y = r + hi;
      const on = (s, z) => [round3(s.centre[0] + s.dir[0] * (z - s.centre[2]) / (s.dir[2] || 1)), y, round3(z)];
      const ends = [[on(tops[-1], A.z0 + INSET), on(tops[1], B.z0 - INSET), tops[-1].id, tops[1].id], [on(tops[1], A.z0 + INSET), on(tops[-1], B.z0 - INSET), tops[1].id, tops[-1].id]];
      const ids = [`F.xAT${p}`, `F.xBT${p}`];
      ends.forEach(([a, b, s0, s1], i) => {
        pole(ids[i], `איקס עליון${P}`, a, b, 'd', 0, 2 + i, { bay: p, xg: 'roof' });
        joints.push({ id: `F.r${2 * i + 1}T${p}`, a: ids[i], b: s0, correct: 'cross', side: 0, bay: p, at: a, carry: true },
          { id: `F.r${2 * i + 2}T${p}`, a: ids[i], b: s1, correct: 'cross', side: 0, bay: p, at: b, carry: true });
      });
      const c = slots.find(s => s.id === ids[0]).centre;
      joints.push({ id: `F.r5T${p}`, a: ids[0], b: ids[1], correct: 'cross', side: 0, bay: p, at: [...c], carry: true });
      xs.push({ ids, where: `למעלה${P}`, side: 0 });
      void D;
    }
  }
  // מרחק כפיתה: each pole reaches 15 cm past its lashings
  for (const s of slots) {
    const ts = joints.filter(j => j.a === s.id || j.b === s.id).map(j => j.at.reduce((a, v, i) => a + (v - s.centre[i]) * s.dir[i], 0));
    const need = up10(2 * Math.max(...ts.map(Math.abs)) + 2 * LASH_ALLOW);
    if (need > s.length) s.length = need;
  }
  // every row has ids of its own (F<tag>.…), so the poles of several rows can be on the plaza together
  const re = x => x.replace(/^F\./, `F${tag}.`);
  for (const q of slots) q.id = re(q.id);
  for (const j of joints) { j.id = re(j.id); j.a = re(j.a); if (j.b) j.b = re(j.b); }
  for (const x of xs) x.ids = x.ids.map(re);
  const zA = members[0].z0, zB = members[members.length - 1].z0;
  const legX = Math.max(...members.flatMap(m => [Math.abs(m.legL.centre[0]), Math.abs(m.legR.centre[0])]));
  return { free: true, slots, joints, xs, legV: legV.map(s => [...s]), zA, zB, depth: zB - zA, span: zB - zA, bays: 1,
    height: Math.min(...members.map(top)), legX, unflatten: true };
}
