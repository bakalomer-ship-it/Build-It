// Free build (בנייה חופשית): the player designs the klaf. No drawing to follow:
// poles from the pile are laid on a ground grid, lashed wherever they cross,
// and then the klaf goes through the same real steps as in the levels
// (stakes, raise, anchor) and is judged only by the inspection (מסדר).
//
// A free klaf lives in the same plan arrays as the levels' klaf (see setPlan in
// level1.js), so the building, the physics and the inspection are shared.
// Coordinates are the klaf's own plane: u across (+u on the left as the pullers
// see it), v up from the foot line.

// the grid the klaf is designed on
export const GRID = { uMax: 2.2, vMin: -0.3, vMax: 3.5, step: 0.1 };

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
export const POLE_MIN = 0.5, POLE_MAX = 4.0;
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
    if (Math.abs(sa) > A.length / 2 - 0.04 || Math.abs(sb) > B.length / 2 - 0.04) continue;
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
