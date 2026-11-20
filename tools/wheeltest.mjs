// Headless check of the giant wheel (station 5): node tools/wheeltest.mjs [raise|frame|ride]
import { World } from '../src/physics.js';
import { TripodSim, BRACES, BRACE_JOINTS, TRI_STAKES, TRI_STAKE_JOINTS, TRI_STAKE_HITS, standing } from '../src/tripod.js';
import { TRI90, WHEEL, GOND, SEAT_ROPES, WheelSim, WH, WH_TUNING, AXLE_Y } from '../src/wheel.js';
import { LEVELS } from '../src/levels.js';

const LV = LEVELS.find(l => l.wheel);
const arg = process.argv[2] || 'all';
let bad = 0;
const expect = (name, got, want) => { if (got !== want) bad++; console.log(`${got === want ? 'ok  ' : 'BAD '} ${name}`); };

// ---- the two 90° tripods, the axle across their heads, the wheel's weight and the pushes ----
function feetOf(cfg) { return cfg.tri.planFeet([cfg.centre[0], cfg.z0 + cfg.centre[1]], cfg.out); }
function frame(name, { load = 0, braces = true, stakes = true, axle = true, pushN = 140 } = {}) {
  const W = new World(); W.mu = 0; W.iterations = 3;
  const sims = LV.klafim.map(cfg => {
    const sp = cfg.tri, b = {}, j = {}, st = {}, sj = {};
    if (braces) for (const q of BRACES) b[q.id] = { length: sp.braceLengths[q.id] };
    if (braces) for (const q of BRACE_JOINTS) j[q.id] = 'square';
    if (stakes) for (const q of TRI_STAKES) st[q.id] = TRI_STAKE_HITS;
    if (stakes) for (const q of TRI_STAKE_JOINTS) sj[q.id] = 'parallel';
    return new TripodSim({ feet: feetOf(cfg), lens: sp.legLengths, braces: b, joints: j, stakes: st, stakeJoints: sj, spec: sp, world: W });
  });
  const st0 = standing(feetOf(LV.klafim[0]), TRI90.legLengths, TRI90);
  if (axle) W.add('rigid', sims[0].legs[1].head, sims[1].legs[1].head, { tag: 'axle' });
  const pushes = [[1.5, 3, [pushN, 0, 0]], [3.5, 5, [-pushN, 0, 0]], [5.5, 7, [0, 0, pushN]], [7.5, 9, [0, 0, -pushN]]];
  let t = 0, fail = null, sunk = 0, slid = 0;
  const dt = 1 / 60;
  while (t < 11) {
    let p = null; for (const [a, b, f] of pushes) if (t > a && t < b) p = f;
    sims.forEach((s, i) => s.forces({ push: p && i === 0 ? p : null, load: load / 2 }));
    W.step(dt, 30); t += dt;
    sunk = Math.max(...sims.map(s => s.sunk())); slid = Math.max(...sims.map(s => s.slid()));
    if (slid > 0.35 || sims.some(s => s.sunk() > 0.25 * s.h0)) { fail = 'collapsed at ' + t.toFixed(1); break; }
  }
  console.log(`   ${name}: apex ${st0.apex.map(v => v.toFixed(2)).join(',')} sunk ${sunk.toFixed(3)} slid ${slid.toFixed(3)} ${fail || ''}`);
  return !fail;
}
if (arg === 'all' || arg === 'frame') {
  expect('the plan stands the head over the upright leg', Math.abs(standing(feetOf(LV.klafim[0]), TRI90.legLengths, TRI90).apex[2]) < 0.01, true);
  expect('two tripods with the axle stand', frame('full'), true);
  expect('they carry the wheel, seat and riders', frame('full + load', { load: 3000 }), true);
  expect('no braces and no stakes: the feet slide', frame('bare', { load: 3000, braces: false, stakes: false }), false);
}

// ---- the ride: two riders get on, the crew turns it a full turn, the מדריך pushes the seat ----
function ride(name, { skip = [], ropes = [0, 1, 2, 3], seconds = 16 } = {}) {
  const b = { poles: {}, joints: {} };
  for (const s of [...WHEEL.slots, ...GOND.slots]) b.poles[s.id] = { length: s.length };
  for (const j of [...WHEEL.joints, ...GOND.joints]) if (!skip.includes(j.id)) b.joints[j.id] = j.correct;
  const hang = { seat: true, ropes: Object.fromEntries(ropes.map(k => [SEAT_ROPES[k].id, true])) };
  const sim = new WheelSim(b, hang);
  const dt = 1 / 60; let t = 0, fail = null, rack = 0, slip = 0, tilt = 0, bend = 0, drop = 0;
  while (t < seconds) {
    const riders = t < 1 ? 0 : Math.min(2, (t - 1));
    sim.step(dt, { riders, spin: t > 3 && t < 12, side: t > 13 && t < 14.5 ? [0, 0, WH_TUNING.sidePush] : null }); t += dt;
    rack = Math.max(rack, sim.rack()); slip = Math.max(slip, sim.slip()); tilt = Math.max(tilt, sim.seatTilt()); bend = Math.max(bend, sim.seatBend()); drop = Math.max(drop, sim.seatDrop());
    if (t > 0.5 && rack > WH_TUNING.rackLimit) { fail = 'wheel folded at ' + t.toFixed(1); break; }
    if (t > 0.5 && slip > WH_TUNING.slipLimit) { fail = 'slipped off the axle at ' + t.toFixed(1); break; }
    if (t > 0.5 && (tilt > WH_TUNING.seatTilt || drop > 0.3)) { fail = 'seat tipped at ' + t.toFixed(1); break; }
    if (t > 0.5 && bend > WH_TUNING.seatBend) { fail = 'seat broke at ' + t.toFixed(1); break; }
  }
  console.log(`   ${name}: rack ${rack.toFixed(3)} slip ${slip.toFixed(3)} tilt ${tilt.toFixed(3)} bend ${bend.toFixed(3)} drop ${drop.toFixed(3)} turns ${(sim.angle / 2 / Math.PI).toFixed(2)} spin ${sim.spin.toFixed(2)} mass ${sim.mass().toFixed(0)} kg ${fail || ''}`);
  return { ok: !fail, turns: sim.angle / 2 / Math.PI };
}
if (arg === 'all' || arg === 'ride') {
  const full = ride('full');
  expect('full wheel turns a whole turn with riders', full.ok && Math.abs(full.turns) >= 1, true);
  expect('no X in the front square: it folds', ride('no X front', { skip: ['W.e10', 'W.e11', 'W.e12', 'W.e13', 'W.x1'] }).ok, false);
  expect('the wheel not lashed to the axle slips off', ride('no axle lashings', { skip: ['W.a1', 'W.a2'] }).ok, false);
  expect('a hanging rope missing: the seat tips', ride('no rope 1', { ropes: [1, 2, 3] }).ok, false);
  expect('a seat corner not lashed: the seat breaks', ride('no seat corner', { skip: ['W.gc1', 'W.gd1'] }).ok, false);
}
console.log(bad ? `${bad} FAILED` : 'wheel: all as expected');
process.exit(bad ? 1 : 0);
