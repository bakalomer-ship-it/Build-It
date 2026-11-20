// מרחק כפיתה: every planned pole is made long enough to leave LASH_ALLOW past
// its last lashing at each end (Omer, 2026-11-20). Plans list their poles at the
// length the drawing shows; this lengthens any that are too short, in 10 cm
// steps. A pole standing on the ground (a leg, a post) keeps its foot where it
// is and only grows upward.
import { LASH_ALLOW } from './blueprints.js';

const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const up10 = x => Math.ceil(x * 10 - 1e-6) / 10;

// slots: [{ id, centre, dir, length }], 2-D (klaf plane) or 3-D; joints: [{ a, b?, at }]
// extra: [[slotId, point]] lashings onto these poles that are listed elsewhere
export function fitAllowance(slots, joints, extra = []) {
  for (const s of slots) {
    const pts = [...joints.filter(j => j.a === s.id || j.b === s.id).map(j => j.at), ...extra.filter(([id]) => id === s.id).map(([, p]) => p)];
    if (!pts.length) continue;
    const t = pts.map(p => dot(p.map((v, i) => v - s.centre[i]), s.dir));
    const lo = Math.min(...t), hi = Math.max(...t), half = s.length / 2;
    // (a leaning leg stands on the ground too: the giant wheel's A-frame towers)
    const standing = Math.abs(s.dir[1]) > 0.5;
    const footY = s.centre[1] - Math.abs(s.dir[1]) * half;
    if (standing && footY < 0.05) {
      // stands on the ground: only the top end needs room above its highest lashing
      const sg = Math.sign(s.dir[1]), top = Math.max(lo * sg, hi * sg);
      const need = up10(half + top + LASH_ALLOW);
      if (need > s.length + 1e-6) { const grow = need - s.length; s.length = need; s.centre = s.centre.map((v, i) => v + s.dir[i] * sg * grow / 2); }
      continue;
    }
    const need = up10(2 * Math.max(Math.abs(lo), Math.abs(hi)) + 2 * LASH_ALLOW);
    if (need > s.length + 1e-6) s.length = need;
  }
}
