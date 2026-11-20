import { sfx } from './sound.js';

// ---------------- the raise as a skill moment ----------------
// While the pullers walk the guy lines in, the klaf leans to one side or the other.
// A jerky, fast pull makes it sway more; a slow, even pull keeps it steady. Two
// buttons let the side holders steady it. The lean pushes the real klaf sideways
// (a klaf without its X racks under it, as the rules say); if it sways right out to
// the red for too long, the pullers let it back down a little and try again.
export const BALANCE = {
  force: 70,       // N sideways at the top when the bar is at its end
  drift: 0.55,     // how strongly the lean wanders on its own while pulling
  jerk: 0.012,     // lean added per pixel of a fast swipe
  calm: 9,         // pull speed (px per move) that adds no sway
  steer: 1.1,      // how much one tap on a side button moves the bar back
  redFor: 0.7,     // seconds at the red end before the pullers let it down
  slip: 22,        // degrees it goes back down
};
export function makeBalance(gentle = false) {
  const B = { lean: 0, v: 0, red: 0, active: false, saves: 0, slips: 0, warnT: 0 };
  const k = gentle ? 0.6 : 1;
  B.reset = () => { B.lean = 0; B.v = 0; B.red = 0; };
  // a swipe on the rope pad: px down this move
  B.stroke = dy => {
    B.active = true;
    const extra = Math.max(0, dy - BALANCE.calm);
    const dir = Math.abs(B.lean) > 0.05 ? Math.sign(B.lean) : (Math.random() < 0.5 ? -1 : 1);
    // a jerk tends to make the lean worse, and sometimes kicks it the other way
    B.v += (Math.random() < 0.75 ? dir : -dir) * extra * BALANCE.jerk * k;
  };
  // side: which way to move the lean (-1 or 1, in the lean's own units)
  B.steer = side => { if (Math.sign(B.lean) === -side && Math.abs(B.lean) > 0.55) B.saves++; B.v += side * BALANCE.steer; };
  // returns 'slip' when the pullers let the klaf back down
  B.tick = (dt, pulling, t) => {
    if (!B.active) return null;
    // wandering: a slow gusty push that changes direction now and then
    if (pulling) B.v += Math.sin(t * 1.7) * Math.sin(t * 0.63 + 1) * BALANCE.drift * k * dt * 2;
    B.v -= B.lean * 0.6 * dt;   // the klaf rights itself a little
    B.v *= Math.exp(-1.6 * dt);
    B.lean = Math.max(-1, Math.min(1, B.lean + B.v * dt));
    if (Math.abs(B.lean) >= 0.98) { B.v *= 0.5; B.red += dt; } else B.red = Math.max(0, B.red - dt * 2);
    if (Math.abs(B.lean) > 0.7) { B.warnT -= dt; if (B.warnT <= 0) { B.warnT = 0.35; sfx.wobble(Math.abs(B.lean)); } }
    if (B.red > BALANCE.redFor) { B.slips++; B.reset(); return 'slip'; }
    return null;
  };
  B.force = () => B.lean * BALANCE.force * k;
  return B;
}
